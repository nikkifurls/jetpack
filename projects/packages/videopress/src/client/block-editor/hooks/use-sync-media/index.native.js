/**
 * External dependencies
 */
import { store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { useEffect, useState, useCallback } from '@wordpress/element';
import { subscribePostSaveEvent } from '@wordpress/react-native-bridge';
import debugFactory from 'debug';
/**
 * Internal dependencies
 */
import { getVideoPressUrl } from '../../../lib/url';
import { snakeToCamel } from '../../../utils/map-object-keys-to-camel-case';
import useVideoData from '../use-video-data';
import useMediaDataUpdate from '../use-video-data-update';

const debug = debugFactory( 'videopress:video:use-sync-media' );

/*
 * Fields list to keep in sync with block attributes.
 */
const videoFieldsToUpdate = [
	'post_id',
	'title',
	'description',
	'privacy_setting',
	'rating',
	'allow_download',
	'display_embed',
	'is_private',
	'duration',
];

/*
 * Map object from video field name to block attribute name.
 * Only register those fields that have a different attribute name.
 */
const mapFieldsToAttributes = {
	privacy_setting: 'privacySetting',
	allow_download: 'allowDownload',
	display_embed: 'displayEmbed',
	is_private: 'isPrivate',
	post_id: 'id',
};

/*
 * Fields list that should invalidate the resolution of the embed (player)
 * when some of them change.
 *
 * Keep in mind some field changes
 * are handled inidrectly by the VideoPress video URL,
 * for instance, `loop`, `autoplay`, `color`, etc...
 */
const invalidateEmbedResolutionFields = [
	'title',
	'privacy_setting',
	'is_private',
	'allow_download',
	'display_embed',
];

/**
 * React hook to keep the data in-sync
 * between the media item and the block attributes.
 *
 * @param {object} attributes		- Block attributes.
 * @param {Function} setAttributes	- Block attributes setter.
 * @returns {object}				- Hook API object.
 */
export function useSyncMedia( attributes, setAttributes ) {
	const { id, guid, isPrivate } = attributes;
	const { videoData, isRequestingVideoData, videoBelongToSite } = useVideoData( {
		id,
		guid,
		skipRatingControl: true,
		maybeIsPrivate: isPrivate,
	} );

	// In native, it's not currently possible to access a post's saved state from the editor store.
	// We therefore need to listen to a native event emitter to know when a post has just been saved.
	const [ postHasBeenJustSaved, setPostHasBeenJustSaved ] = useState( false );

	useEffect( () => {
		const subscription = subscribePostSaveEvent( () => setPostHasBeenJustSaved( true ) );

		return () => {
			subscription?.remove();
		};
	}, [] );

	const invalidateResolution = useDispatch( coreStore ).invalidateResolution;

	const [ initialState, setState ] = useState( {} );

	const [ error, setError ] = useState( null );

	const updateInitialState = useCallback( data => {
		setState( current => ( { ...current, ...data } ) );
	}, [] );

	/*
	 * Media data => Block attributes (update)
	 *
	 * Populate block attributes with the media data,
	 * provided by the VideoPress API (useVideoData hook),
	 * when the block is mounted.
	 */
	useEffect( () => {
		if ( isRequestingVideoData ) {
			return;
		}

		// Bail early if the video data is not available.
		if (
			! videoData ||
			Object.keys( videoData ).filter( key => videoFieldsToUpdate.includes( key ) ).length === 0
		) {
			return;
		}

		const attributesToUpdate = {};

		// Build an object with video data to use for the initial state.
		const initialVideoData = videoFieldsToUpdate.reduce( ( acc, key ) => {
			if ( typeof videoData[ key ] === 'undefined' ) {
				return acc;
			}

			let videoDataValue = videoData[ key ];

			// Cast privacy_setting to number to match the block attribute type.
			if ( 'privacy_setting' === key ) {
				videoDataValue = Number( videoDataValue );
			}

			acc[ key ] = videoDataValue;
			const attrName = mapFieldsToAttributes[ key ] || snakeToCamel( key );

			if ( videoDataValue !== attributes[ attrName ] ) {
				debug(
					'%o is out of sync. Updating %o attr from %o to %o ',
					key,
					attrName,
					attributes[ attrName ],
					videoDataValue
				);
				attributesToUpdate[ attrName ] = videoDataValue;
			}
			return acc;
		}, {} );

		updateInitialState( initialVideoData );
		debug( 'Initial state: ', initialVideoData );

		if ( ! Object.keys( initialVideoData ).length || ! Object.keys( attributesToUpdate ).length ) {
			return;
		}

		debug( 'Updating attributes: ', attributesToUpdate );
		setAttributes( attributesToUpdate );
	}, [ videoData, isRequestingVideoData ] );

	const updateMediaHandler = useMediaDataUpdate( id );

	/*
	 * Block attributes => Media data (sync)
	 *
	 * Compare the current attribute values of the block
	 * with the initial state,
	 * and sync the media data if it detects changes on it
	 * (via the VideoPress API) when the post saves.
	 */
	useEffect( () => {
		if ( ! postHasBeenJustSaved ) {
			return;
		}

		debug( '%o Post has been just saved. Syncing...', attributes?.guid );

		setPostHasBeenJustSaved( false );

		if ( ! attributes?.id ) {
			debug( '%o No media ID found. Impossible to sync. Bail early', attributes?.guid );
			return;
		}

		/*
		 * Filter the attributes that have changed their values,
		 * based on the initial state.
		 */
		const dataToUpdate = videoFieldsToUpdate.reduce( ( acc, key ) => {
			const attrName = mapFieldsToAttributes[ key ] || key;
			const stateValue = initialState[ key ];
			const attrValue = attributes[ attrName ];

			if ( initialState[ key ] !== attributes[ attrName ] ) {
				debug( 'Field to sync %o: %o => %o: %o', key, stateValue, attrName, attrValue );
				acc[ key ] = attributes[ attrName ];
			}
			return acc;
		}, {} );

		// When nothing to update, bail out early.
		if ( ! Object.keys( dataToUpdate ).length ) {
			return debug( 'No data to sync. Bail early' );
		}

		debug( 'Syncing data: ', dataToUpdate );

		// Sync the block attributes data with the video data
		updateMediaHandler( dataToUpdate )
			.then( () => {
				// Update local state with fresh video data.
				updateInitialState( dataToUpdate );

				/*
				 * Update isPrivate attribute:
				 * `is_private` is a read-only metadata field.
				 * The VideoPress API provides its value
				 * and depends on the `privacy_setting`
				 * and `private_enabled_for_site` fields.
				 */
				if ( dataToUpdate.privacy_setting ) {
					const isPrivateVideo =
						dataToUpdate.privacy_setting !== 2
							? dataToUpdate.privacy_setting === 1
							: videoData.private_enabled_for_site;

					debug( 'Updating isPrivate attribute: %o', isPrivateVideo );
					setAttributes( { isPrivate: isPrivateVideo } );
				}

				const shouldInvalidateResolution = Object.keys( dataToUpdate ).filter( key =>
					invalidateEmbedResolutionFields.includes( key )
				);

				if ( shouldInvalidateResolution?.length ) {
					debug( 'Invalidate resolution because of %o', shouldInvalidateResolution.join( ', ' ) );

					const videoPressUrl = getVideoPressUrl( attributes.guid, attributes );
					invalidateResolution( 'getEmbedPreview', [ videoPressUrl ] );
				}
			} )
			.catch( updateMediaError => {
				debug( '%o Error while syncing data: %o', attributes?.guid, updateMediaError );
				setError( updateMediaError );
			} );
	}, [
		postHasBeenJustSaved,
		updateMediaHandler,
		updateInitialState,
		attributes,
		initialState,
		invalidateResolution,
		videoFieldsToUpdate,
	] );

	return {
		forceInitialState: updateInitialState,
		videoData,
		isRequestingVideoData,
		videoBelongToSite,
		error,
	};
}
