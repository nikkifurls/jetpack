/**
 * WordPress dependencies
 */
import { useConnection } from '@automattic/jetpack-connection';
import { store as blockEditorStore } from '@wordpress/block-editor';
import {
	BlockIcon,
	useBlockProps,
	InspectorControls,
	BlockControls,
} from '@wordpress/block-editor';
import { createBlock } from '@wordpress/blocks';
import { Spinner, Placeholder, Button, withNotices } from '@wordpress/components';
import { store as coreStore } from '@wordpress/core-data';
import { useSelect, useDispatch } from '@wordpress/data';
import { useEffect, useState, useCallback, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import classNames from 'classnames';
import debugFactory from 'debug';
/**
 * Internal dependencies
 */
import getMediaToken from '../../../lib/get-media-token';
import { buildVideoPressURL, getVideoPressUrl } from '../../../lib/url';
import { useSyncMedia } from '../../hooks/use-video-data-update';
import Banner from './components/banner';
import ColorPanel from './components/color-panel';
import DetailsPanel from './components/details-panel';
import { VideoPressIcon } from './components/icons';
import PlaybackPanel from './components/playback-panel';
import PosterImageBlockControl from './components/poster-image-block-control';
import PrivacyAndRatingPanel from './components/privacy-and-rating-panel';
import ReplaceControl from './components/replace-control';
import TracksControl from './components/tracks-control';
import VideoPressPlayer from './components/videopress-player';
import VideoPressUploader from './components/videopress-uploader';
import { description, title } from '.';
/**
 * Types
 */
import type { VideoBlockAttributes } from './types';
import type React from 'react';

import './editor.scss';

const debug = debugFactory( 'videopress:video:edit' );

const { myJetpackConnectUrl } = window.videoPressEditorState;

const VIDEO_PREVIEW_ATTEMPTS_LIMIT = 10;

export const PlaceholderWrapper = withNotices( function ( {
	children,
	errorMessage,
	noticeUI,
	noticeOperations,
	instructions = description,
	disableInstructions,
} ) {
	useEffect( () => {
		if ( ! errorMessage ) {
			return;
		}

		noticeOperations.removeAllNotices();
		noticeOperations.createErrorNotice( errorMessage );
	}, [ errorMessage, noticeOperations ] );

	return (
		<Placeholder
			icon={ <BlockIcon icon={ VideoPressIcon } /> }
			label={ title }
			instructions={ disableInstructions ? null : instructions }
			notices={ noticeUI }
		>
			{ children }
		</Placeholder>
	);
} );

/**
 * VideoPress block Edit react components
 *
 * @param {object} props                 - Component props.
 * @param {object} props.attributes      - Block attributes.
 * @param {Function} props.setAttributes - Function to set block attributes.
 * @param {boolean} props.isSelected     - Whether the block is selected.
 * @param {string} props.clientId        - Block client ID.
 * @returns {React.ReactNode}            - React component.
 */
export default function VideoPressEdit( {
	attributes,
	setAttributes,
	isSelected,
	clientId,
} ): React.ReactNode {
	const {
		autoplay,
		loop,
		muted,
		controls,
		playsinline,
		preload,
		useAverageColor,
		seekbarColor,
		seekbarLoadingColor,
		seekbarPlayedColor,
		guid,
		id,
		cacheHtml,
		poster,
		align,
		videoRatio,
		tracks,
		isPrivate,
		src,
		caption,
		isExample,
	} = attributes;

	/*
	 * Force className cleanup.
	 * It adds ` wp-embed-aspect-21-9 wp-has-aspect-ratio` classes
	 * when transforming from embed block.
	 */
	delete attributes.className;

	const videoPressUrl = getVideoPressUrl( guid, {
		autoplay,
		controls,
		loop,
		muted,
		playsinline,
		preload,
		seekbarColor,
		seekbarLoadingColor,
		seekbarPlayedColor,
		useAverageColor,
		poster,
	} );

	// Get the redirect URI for the connection flow.
	const { isUserConnected } = useConnection();
	const [ isRedirectingToMyJetpack, setIsRedirectingToMyJetpack ] = useState( false );
	/*
	 * Request token when site is private
	 */
	const [ token, setToken ] = useState( null );
	useEffect( () => {
		if ( ! isPrivate ) {
			return setToken( null );
		}

		getMediaToken( 'playback', { id, guid } ).then( tokenData => {
			setToken( tokenData?.token );
		} );
	}, [ isPrivate ] );

	// Store if the chapters file is auto-generated in a local state.
	const [ isAutoGeneratedChapter, setIsAutoGeneratedChapter ] = useState( true );

	// Detect if the chapter file is auto-generated.
	const chapter = tracks?.filter( track => track.kind === 'chapters' )?.[ 0 ];

	useEffect( () => {
		if ( ! chapter || ! chapter.src ) {
			return;
		}

		// Wait for the token when the video is private.
		if ( isPrivate && ! token ) {
			return;
		}

		const queryString = token
			? `?${ new URLSearchParams( { metadata_token: token } ).toString() }`
			: '';

		const chapterUrl = `https://videos.files.wordpress.com/${ guid }/${ chapter.src }${ queryString }`;

		try {
			fetch( chapterUrl )
				.then( function ( response ) {
					response.text().then( function ( text ) {
						if ( ! text ) {
							return;
						}

						const isAutoGeneratedChaptersFile = /videopress-chapters-auto-generated/.test( text );
						if ( isAutoGeneratedChaptersFile ) {
							debug( 'Chapter %o auto-generated detected', chapter.src );
						}
						setIsAutoGeneratedChapter( isAutoGeneratedChaptersFile );
					} );
				} )
				.catch( function ( error ) {
					// eslint-disable-next-line no-console
					console.error( error );
				} );
		} catch ( error ) {
			throw new Error( error?.message ?? error );
		}
	}, [ chapter, guid, token, isPrivate ] );

	const { videoData, isRequestingVideoData, error: syncError } = useSyncMedia(
		attributes,
		setAttributes,
		{
			isAutoGeneratedChapter,
		}
	);

	const { filename } = videoData;

	// Get video preview status.
	const defaultPreview = { html: null, scripts: [], width: null, height: null };
	const { preview, isRequestingEmbedPreview } = useSelect(
		select => {
			if ( ! videoPressUrl ) {
				return {
					preview: defaultPreview,
					isRequestingEmbedPreview: false,
				};
			}

			return {
				preview: select( coreStore ).getEmbedPreview( videoPressUrl ) || defaultPreview,
				isRequestingEmbedPreview:
					select( coreStore ).isRequestingEmbedPreview( videoPressUrl ) || false,
			};
		},
		[ videoPressUrl ]
	);

	// Pick video properties from preview.
	const { html: previewHtml, scripts, width: previewWidth, height: previewHeight } = preview;

	/*
	 * Store the preview markup and video thumbnail image
	 * into a block `html` and `thumbnail` attributes respectively.
	 *
	 * `html` will be used to render the player asap,
	 * while a fresh preview is going fetched from the server,
	 * via the core store selectors.
	 *
	 * `thumbnail` will be shown as a fallback image
	 * until the fetching preview process finishes.
	 */
	useEffect( () => {
		if ( ! previewHtml || previewHtml === cacheHtml ) {
			return;
		}

		setAttributes( { cacheHtml: previewHtml } );
	}, [ previewHtml, cacheHtml, setAttributes ] );

	const html = previewHtml || cacheHtml;

	// Store the video ratio to define the initial height of the video.
	useEffect( () => {
		if ( ! previewWidth || ! previewHeight ) {
			return;
		}

		const ratio = ( previewHeight / previewWidth ) * 100;
		if ( ratio === videoRatio ) {
			return;
		}

		setAttributes( { videoRatio: ratio } );
	}, [ videoRatio, previewWidth, previewHeight, setAttributes ] );

	// Helper to invalidate the preview cache.
	const invalidateResolution = useDispatch( coreStore ).invalidateResolution;
	const invalidateCachedEmbedPreview = useCallback( () => {
		invalidateResolution( 'getEmbedPreview', [ videoPressUrl ] );
	}, [ videoPressUrl, invalidateResolution ] );

	/*
	 * Getting VideoPress preview.
	 * The following code tries to handle issues
	 * when the preview is not available even when
	 * the VideoPress URL is gotten.
	 * It attempts every two seconds to get the so desired video preview.
	 */
	const [ generatingPreviewCounter, setGeneratingPreviewCounter ] = useState( 0 );

	const rePreviewAttemptTimer = useRef< NodeJS.Timeout | void >();

	/**
	 * Clean the generating process timer.
	 *
	 * @todo improve doc
	 */
	function cleanRegeneratingProcessTimer() {
		if ( ! rePreviewAttemptTimer?.current ) {
			return;
		}

		/*
		 * Clean the timer, and updates the reference
		 * to force a new attempt in case the preview is not available.
		 */
		rePreviewAttemptTimer.current = clearInterval( rePreviewAttemptTimer.current );
	}

	useEffect( () => {
		if ( generatingPreviewCounter >= VIDEO_PREVIEW_ATTEMPTS_LIMIT ) {
			debug( 'Generating preview ➡ attempts number reached out 😪', generatingPreviewCounter );
			return cleanRegeneratingProcessTimer();
		}

		// VideoPress URL is not defined. Bail early and cleans the time.
		if ( ! videoPressUrl ) {
			debug( 'Generating preview ➡ No URL Provided 👋🏻' );
			return cleanRegeneratingProcessTimer();
		}

		// Bail early (clean the timer) if the preview is already being requested.
		if ( isRequestingEmbedPreview ) {
			debug( 'Generating preview ➡ Requesting… ⌛' );
			return cleanRegeneratingProcessTimer();
		}

		// Bail early (clean the timer) when preview is defined.
		if ( preview.html ) {
			debug( 'Generating preview ➡ Preview achieved 🎉 %o', preview );
			return cleanRegeneratingProcessTimer();
		}

		// Bail early when it has been already started.
		if ( rePreviewAttemptTimer?.current ) {
			debug( 'Generating preview ➡ Process already requested ⌛' );
			return;
		}

		rePreviewAttemptTimer.current = setTimeout( () => {
			// Abort whether the preview is already defined.
			if ( preview.html ) {
				debug( 'Generating preview ➡ Preview already achieved 🎉 %o', preview );
				setGeneratingPreviewCounter( 0 ); // reset counter.
				return;
			}

			setGeneratingPreviewCounter( v => v + 1 );
			debug(
				'Generating preview ➡ Not achieved so far. Start attempt %o 🔥',
				generatingPreviewCounter + 1 // +1 because the counter is updated after the effect.
			);
			invalidateCachedEmbedPreview();
		}, 2000 );

		return cleanRegeneratingProcessTimer;
	}, [
		generatingPreviewCounter,
		rePreviewAttemptTimer,
		invalidateCachedEmbedPreview,
		preview,
		videoPressUrl,
		isRequestingEmbedPreview,
	] );

	const { className: blockMainClassName, ...blockProps } = useBlockProps( {
		className: 'wp-block-jetpack-videopress',
	} );

	// Setting video media process
	const [ isUploadingFile, setIsUploadingFile ] = useState( ! guid );
	const [ fileToUpload, setFileToUpload ] = useState( null );

	const { replaceBlock } = useDispatch( blockEditorStore );

	// Replace video state
	const [ isReplacingFile, setIsReplacingFile ] = useState< {
		isReplacing: boolean;
		prevAttrs: VideoBlockAttributes;
	} >( {
		isReplacing: false,
		prevAttrs: {},
	} );

	// Cancel replace video handler
	const cancelReplacingVideoFile = () => {
		setAttributes( isReplacingFile.prevAttrs );
		setIsReplacingFile( { isReplacing: false, prevAttrs: {} } );
		setIsUploadingFile( false );
	};

	// Render Example block view
	if ( isExample ) {
		return (
			<img
				style={ {
					width: '100%',
					height: 'auto',
					backgroundSize: 'cover',
				} }
				className="wp-block-jetpack-videopress__example"
				src={ src }
				alt={ caption }
			/>
		);
	}

	// Render uploading block view
	if ( isUploadingFile ) {
		const handleDoneUpload = newVideoData => {
			setIsUploadingFile( false );
			if ( isReplacingFile.isReplacing ) {
				const newBlockAttributes = {
					...attributes,
					...newVideoData,
				};

				// Delete attributes that are not needed.
				delete newBlockAttributes.poster;

				setIsReplacingFile( { isReplacing: false, prevAttrs: {} } );
				replaceBlock( clientId, createBlock( 'videopress/video', newBlockAttributes ) );
				return;
			}

			setAttributes( { id: newVideoData.id, guid: newVideoData.guid, title: newVideoData.title } );
		};

		let connectButtonText = __( 'Connect', 'jetpack-videopress-pkg' );
		if ( isRedirectingToMyJetpack ) {
			connectButtonText = __( 'Redirecting…', 'jetpack-videopress-pkg' );
		}

		return (
			<div { ...blockProps } className={ blockMainClassName }>
				<>
					{ ! isUserConnected && (
						<Banner
							action={
								<Button
									variant="primary"
									onClick={ () => {
										setIsRedirectingToMyJetpack( true );
										window.location.href = myJetpackConnectUrl;
									} }
									disabled={ isRedirectingToMyJetpack }
									isBusy={ isRedirectingToMyJetpack }
								>
									{ connectButtonText }
								</Button>
							}
						>
							{ __(
								'Connect your account to continue using VideoPress',
								'jetpack-videopress-pkg'
							) }
						</Banner>
					) }
					<VideoPressUploader
						setAttributes={ setAttributes }
						attributes={ attributes }
						handleDoneUpload={ handleDoneUpload }
						fileToUpload={ fileToUpload }
						isReplacing={ isReplacingFile?.isReplacing }
						onReplaceCancel={ cancelReplacingVideoFile }
					/>
				</>
			</div>
		);
	}

	// Generating video preview.
	if (
		( isRequestingEmbedPreview || ! preview.html ) &&
		generatingPreviewCounter > 0 &&
		generatingPreviewCounter < VIDEO_PREVIEW_ATTEMPTS_LIMIT
	) {
		return (
			<div { ...blockProps } className={ blockMainClassName }>
				<PlaceholderWrapper disableInstructions>
					<div className="loading-wrapper">
						<Spinner />
						{ __( 'Generating preview…', 'jetpack-videopress-pkg' ) }
						<strong> { generatingPreviewCounter }</strong>
					</div>
				</PlaceholderWrapper>
			</div>
		);
	}

	// 5 - Generating video preview failed.
	if ( generatingPreviewCounter >= VIDEO_PREVIEW_ATTEMPTS_LIMIT && ! preview.html ) {
		return (
			<div { ...blockProps } className={ blockMainClassName }>
				<PlaceholderWrapper
					errorMessage={ __(
						'Impossible to get a video preview after ten attempts.',
						'jetpack-videopress-pkg'
					) }
					onNoticeRemove={ invalidateResolution }
				>
					<div className="videopress-uploader__error-actions">
						<Button variant="primary" onClick={ invalidateResolution }>
							{ __( 'Try again', 'jetpack-videopress-pkg' ) }
						</Button>
						<Button
							variant="secondary"
							onClick={ () => {
								setAttributes( { src: undefined, id: undefined, guid: undefined } );
							} }
						>
							{ __( 'Cancel', 'jetpack-videopress-pkg' ) }
						</Button>
					</div>
				</PlaceholderWrapper>
			</div>
		);
	}

	// Show VideoPress player.
	return (
		<div
			{ ...blockProps }
			className={ classNames( blockMainClassName, {
				[ `align${ align }` ]: align,
				'is-updating-preview': ! previewHtml,
			} ) }
		>
			<BlockControls group="block">
				<PosterImageBlockControl
					attributes={ attributes }
					setAttributes={ setAttributes }
					clientId={ clientId }
				/>

				<TracksControl attributes={ attributes } setAttributes={ setAttributes } />
			</BlockControls>

			<BlockControls group="other">
				<ReplaceControl
					setAttributes={ setAttributes }
					attributes={ attributes }
					onUploadFileStart={ media => {
						// Store current attributes in case we wanto to cancel the replacing.
						setIsReplacingFile( {
							isReplacing: true,
							prevAttrs: attributes,
						} );
						setIsUploadingFile( true );

						// Clean relevant attributes to show the uploader placeholder.
						setAttributes( { id: null, guid: null, cacheHtml: '', videoRatio: null } );

						// Pass, through local state, the new file to upload.
						setFileToUpload( media );
					} }
					onSelectVideoFromLibrary={ media => {
						// Depending on the endpoint, `videopress_guid` can be an array or a string.
						const mediaGuid = Array.isArray( media.videopress_guid )
							? media.videopress_guid[ 0 ]
							: media.videopress_guid;
						if ( ! mediaGuid ) {
							debug( 'No media guid provided' );
							return;
						}

						setAttributes( {
							guid: mediaGuid,
							id: media.id,
							src: media.url,
							title: media.title,
							description: media.description,
						} );
					} }
					onSelectURL={ videoSource => {
						const { guid: guidFromSource, url: srcFromSource } = buildVideoPressURL( videoSource );
						if ( ! guidFromSource ) {
							debug( 'Invalid URL. No video GUID  provided' );
							return;
						}

						// Update guid based on the URL.
						setAttributes( { guid: guidFromSource, src: srcFromSource } );
					} }
				/>
			</BlockControls>

			<InspectorControls>
				<DetailsPanel
					filename={ filename }
					chapter={ chapter }
					isAutoGeneratedChapter={ isAutoGeneratedChapter }
					updateError={ syncError }
					isRequestingVideoData={ isRequestingVideoData }
					{ ...{ attributes, setAttributes } }
				/>
				<PlaybackPanel { ...{ attributes, setAttributes, isRequestingVideoData } } />
				<PrivacyAndRatingPanel { ...{ attributes, setAttributes, isRequestingVideoData } } />
				<ColorPanel { ...{ attributes, setAttributes, isRequestingVideoData } } />
			</InspectorControls>

			<VideoPressPlayer
				html={ html }
				isRequestingEmbedPreview={ isRequestingEmbedPreview }
				scripts={ scripts }
				attributes={ attributes }
				setAttributes={ setAttributes }
				isSelected={ isSelected }
				preview={ preview }
			/>
		</div>
	);
}
