import { CONNECTION_STORE_ID } from '@automattic/jetpack-connection';
import { select } from '@wordpress/data';
import { useContext, useEffect, useRef, useState } from '@wordpress/element';
import { debounce } from 'lodash';
import { getLoadContext, waitForObject } from '../../../../shared/block-editor-asset-loader';
import {
	convertZoomLevelToCameraDistance,
	convertCameraDistanceToZoomLevel,
} from '../../mapkit-utils';
import { MapkitContext } from '../context';

const useMapkit = () => {
	return useContext( MapkitContext );
};

// mapRef can be a ref to the element that will render the map
// or a ref to the element that will be on the page when the map is rendered.
// It is only used here to determine the document and window to use.
const useMapkitSetup = mapRef => {
	const [ loaded, setLoaded ] = useState( false );
	const [ error, setError ] = useState( false );
	const [ mapkit, setMapkit ] = useState( null );
	const [ _currentWindow, setCurrentWindow ] = useState( null );
	const [ _currentDoc, setCurrentDoc ] = useState( null );

	useEffect( () => {
		const blog_id = select( CONNECTION_STORE_ID ).getBlogId();

		const loadLibrary = () => {
			return new Promise( resolve => {
				const { currentDoc } = getLoadContext( mapRef.current );
				const element = currentDoc.createElement( 'script' );
				element.addEventListener(
					'load',
					async () => {
						const { currentWindow } = getLoadContext( mapRef.current );

						const mapkitObj = await waitForObject( currentWindow, 'mapkit' );

						resolve( mapkitObj );
					},
					{ once: true }
				);
				element.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
				element.crossOrigin = 'anonymous';
				currentDoc.head.appendChild( element );
			} );
		};

		const fetchKey = mapkitObj => {
			return new Promise( resolve => {
				mapkitObj.init( {
					authorizationCallback: async done => {
						const response = await fetch(
							`https://public-api.wordpress.com/wpcom/v2/sites/${ blog_id }/mapkit`
						);
						if ( response.status === 200 ) {
							const data = await response.json();
							done( data.wpcom_mapkit_access_token );
						} else {
							setError( 'Mapkit API error' );
						}
						resolve();
					},
				} );
			} );
		};

		if ( mapRef.current ) {
			const { currentWindow, currentDoc } = getLoadContext( mapRef.current );
			setCurrentWindow( currentWindow );
			setCurrentDoc( currentDoc );

			// if mapkit is already loaded, reuse it.
			if ( currentWindow.mapkit ) {
				setMapkit( currentWindow.mapkit );
				setLoaded( true );
			} else {
				loadLibrary().then( mapkitObj => {
					setMapkit( mapkitObj );

					fetchKey( mapkitObj ).then( () => {
						setLoaded( true );
					} );
				} );
			}
		}
	}, [ mapRef ] );

	return { loaded, error, mapkit, currentDoc: _currentDoc, currentWindow: _currentWindow };
};

const useMapkitInit = ( mapkit, loaded, mapRef ) => {
	const [ map, setMap ] = useState( null );
	useEffect( () => {
		if ( mapkit && loaded ) {
			setMap( new mapkit.Map( mapRef.current ) );
		}
	}, [ mapkit, loaded, mapRef ] );
	return { map };
};

const useMapkitCenter = ( center, setCenter ) => {
	const { mapkit, map } = useMapkit();
	const memoizedCenter = useRef( center );

	useEffect( () => {
		if ( ! mapkit || ! map || ! memoizedCenter.current ) {
			return;
		}
		map.center = new mapkit.Coordinate( memoizedCenter.current.lat, memoizedCenter.current.lng );
	}, [ mapkit, map, memoizedCenter ] );

	useEffect( () => {
		if ( ! mapkit || ! map ) {
			return;
		}

		const changeRegion = () => {
			if ( map.center ) {
				const { latitude, longitude } = map.center;
				setCenter( { lat: latitude, lng: longitude } );
			}
		};

		map.addEventListener( 'region-change-end', debounce( changeRegion, 1000 ) );

		return () => {
			map.removeEventListener( 'region-change-end', changeRegion );
		};
	}, [ mapkit, map, setCenter ] );
};

const useMapkitType = mapStyle => {
	const { mapkit, map } = useMapkit();

	useEffect( () => {
		if ( ! mapkit || ! map ) {
			return;
		}
		map.mapType = ( () => {
			switch ( mapStyle ) {
				case 'satellite':
					return mapkit.Map.MapTypes.Satellite;
				case 'muted':
					return mapkit.Map.MapTypes.Muted;
				case 'hybrid':
					return mapkit.Map.MapTypes.Hybrid;
				default:
					return mapkit.Map.MapTypes.Standard;
			}
		} )();
	}, [ mapkit, map, mapStyle ] );
};

const useMapkitZoom = ( zoom, setZoom ) => {
	const { mapkit, map } = useMapkit();

	useEffect( () => {
		if ( mapkit && map ) {
			const cameraDistance = convertZoomLevelToCameraDistance( zoom, map.center.latitude );
			if ( cameraDistance !== map.cameraDistance ) {
				map.cameraDistance = cameraDistance;
			}
		}
	}, [ mapkit, map, zoom ] );

	useEffect( () => {
		const changeZoom = () => {
			setZoom( convertCameraDistanceToZoomLevel( map.cameraDistance, map.center.latitude ) );
		};

		map.addEventListener( 'zoom-end', changeZoom );

		return () => {
			map.removeEventListener( 'zoom-end', changeZoom );
		};
	}, [ mapkit, map, setZoom ] );
};

const useMapkitPoints = ( points, markerColor, delegate = {}, onSelect = null ) => {
	const { mapkit, map, loaded } = useMapkit();
	useEffect( () => {
		if ( loaded ) {
			map.removeAnnotations( map.annotations );
			const annotations = points.map( point => {
				const marker = new mapkit.MarkerAnnotation(
					new mapkit.Coordinate( point.coordinates.latitude, point.coordinates.longitude ),
					{ color: markerColor }
				);
				marker.calloutEnabled = true;
				marker.title = point.title;
				marker.callout = delegate;
				if ( onSelect ) {
					marker.addEventListener( 'select', () => onSelect( point, map ) );
				}
				return marker;
			} );
			map.showItems( annotations );
		}
	}, [ points, loaded, map, mapkit, markerColor, onSelect, delegate ] );
};

export {
	useMapkit,
	useMapkitSetup,
	useMapkitInit,
	useMapkitZoom,
	useMapkitType,
	useMapkitCenter,
	useMapkitPoints,
};
