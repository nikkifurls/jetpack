<?php

require_once __DIR__ . '/class.wp-super-cache-settings-map.php';

class WP_Super_Cache_Rest_Update_Settings extends WP_REST_Controller {

	/**
	 * Update the cache settings.
	 *
	 * @param WP_REST_Request $request Full data about the request.
	 *
	 * @return WP_Error|WP_REST_Response
	 */
	public function callback( $request ) {
		$parameters = $request->get_json_params();

		// Override to force locking.
		if ( defined( 'WPSC_DISABLE_LOCKING' ) ) {
			$parameters['cache_disable_locking'] = 1;
		}

		// Set the nonce to valid, so that form sets will work later.
		global $valid_nonce;
		$valid_nonce = true;

		if ( isset( $parameters['easy'] ) ) {
			$errors = $this->toggle_easy_caching( $parameters['easy'] );

		} else {

			$errors = array();

			foreach ( $parameters as $name => $value ) {
				if ( $has_error = $this->set_value_by_key( $value, $name ) ) {
					$errors[] = $has_error;
				}
			}

			$this->save_time_settings();
			$this->save_preload_settings();
		}

		if ( count( $errors ) > 0 ) {
			return rest_ensure_response( $errors );

		} else {
			return rest_ensure_response( array( 'updated' => true ) );
		}
	}

	/**
	 * Given a key and a value, set the value for that key, based on
	 * the configuration in the settings map.
	 *
	 * @param mixed $value
	 * @param string $key
	 *
	 * @return string|null
	 */
	protected function set_value_by_key( $value, $key ) {

		$settings_map = WP_Super_Cache_Settings_Map::$map;
		$error = null;

		// If this parameter isn't in the map, then let's ignore it.
		if ( ! isset( $settings_map[ $key ] ) ) {
			return null;
		}

		$map = $settings_map[ $key ];

		if ( isset( $map['set'] ) ) {
			$set_method = $map['set'];

			if ( method_exists( $this, $set_method ) ) {
				if ( $has_error = $this->$set_method( $value, $key ) ) {
					$error = $has_error;
				}

			} elseif ( function_exists( $set_method ) ) {
				$set_method( $value );
			}

		} elseif ( isset( $map['global'] ) ) {

			if ( method_exists( $this, 'set_' . $map['global'] ) ) {
				$set_method = 'set_' . $map['global'];

				if ( $has_error = $this->$set_method( $value ) ) {
					$error = $has_error;
				}
			} else {

				$this->set_global( $map['global'], $value );
			}
		}

		return $error;
	}

	/**
	 * A generic method for setting globals.
	 *
	 * The setting must be added to the whitelist in order to be set this way.
	 *
	 * @param string $global_name
	 * @param mixed $value
	 */
	protected function set_global( $global_name, $value ) {
		$whitelist = array(
			'wp_super_cache_late_init',
			'wp_cache_disable_utf8',
			'wp_cache_no_cache_for_get',
			'wp_supercache_304',
			'wp_cache_mfunc_enabled',
			'wp_cache_mobile_enabled',
			'wp_cache_front_page_checks',
			'wp_supercache_cache_list',
			'wp_cache_hello_world',
			'wp_cache_clear_on_post_edit',
			'cache_rebuild_files',
			'wp_cache_refresh_single_only',
			'wp_cache_mutex_disabled',
		);

		if ( ! in_array( $global_name, $whitelist ) ) {
			return false;
		}

		wp_cache_setting( $global_name, (int)$value );

	}

	/**
	 * @param mixed $value
	 */
	protected function set_wp_cache_location( $value ) {
		global $cache_path;

		if ( $value != '' && ( ! isset( $cache_path ) || $value != $cache_path ) ) {
			$dir = realpath( trailingslashit( dirname( $value ) ) );
			if ( $dir == false ) {
				$dir = WP_CONTENT_DIR . '/cache/';

			} else {
				$dir = trailingslashit( $dir ) . trailingslashit( wpsc_deep_replace( array(
						'..',
						'\\'
					), basename( $value ) ) );
			}

			$new_cache_path = $dir;

		} else {
			$new_cache_path = WP_CONTENT_DIR . '/cache/';
		}

		if ( $new_cache_path != $cache_path ) {
			if ( file_exists( $new_cache_path ) == false ) {
				rename( $cache_path, $new_cache_path );
			}

			$cache_path = $new_cache_path;
			wp_cache_setting( 'cache_path', $cache_path );
		}
	}

	/**
	 * @param mixed $value
	 */
	protected function set_cache_enabled( $value ) {
		if ( $value != 1 ) {
			wp_cache_disable();

			return;
		}

		wp_cache_enable();
	}

	/**
	 * @param mixed $value
	 */
	protected function set_lock_down( $value ) {
		$_POST[ 'wp_lock_down' ] = (int)$value;
		wp_update_lock_down();
	}

	/**
	 * @param mixed $value
	 */
	protected function set_super_cache_enabled( $value ) {
		global $wp_cache_mod_rewrite;

		if ( $value === 0 ) {
			wp_cache_enable(); // logged in cache
			wp_super_cache_disable();

		} elseif ( $value == 1 ) {
			$wp_cache_mod_rewrite = 1; // we need this because supercached files can be served by PHP too.

		} else { // super_cache_enabled == 2
			$wp_cache_mod_rewrite = 0; // cache files served by PHP
		}

		wp_cache_setting( 'wp_cache_mod_rewrite', $wp_cache_mod_rewrite );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_wp_cache_not_logged_in( $value ) {
		global $wp_cache_not_logged_in, $cache_path;

		if ( 1 == $value ) {
			if ( 0 == $wp_cache_not_logged_in && function_exists( 'prune_super_cache' ) ) {
				prune_super_cache( $cache_path, true );
			}

			$wp_cache_not_logged_in = 1;

		} else {
			$wp_cache_not_logged_in = 0;
		}

		wp_cache_setting( 'wp_cache_not_logged_in', $wp_cache_not_logged_in );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_wp_cache_make_known_anon( $value ) {
		global $wp_cache_make_known_anon, $cache_path;

		if ( 1 == $value ) {
			if ( $wp_cache_make_known_anon == 0 && function_exists( 'prune_super_cache' ) ) {
				prune_super_cache( $cache_path, true );
			}

			$wp_cache_make_known_anon = 1;

		} else {
			$wp_cache_make_known_anon = 0;
		}

		wp_cache_setting( 'wp_cache_make_known_anon', $wp_cache_make_known_anon );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_wp_cache_object_cache( $value ) {
		global $_wp_using_ext_object_cache, $wp_cache_object_cache, $cache_path;

		if ( ! $_wp_using_ext_object_cache ) {
			return;
		}

		if ( $value == 0 ) {
			if ( function_exists( 'prune_super_cache' ) ) {
				prune_super_cache( $cache_path, true );
			}

			$wp_cache_object_cache = 1;

		} else {
			$wp_cache_object_cache = 0;
		}

		wp_cache_setting( 'wp_cache_object_cache', $wp_cache_object_cache );
	}

	/**
	 * @param mixed $value
	 *
	 * @return null|string
	 */
	protected function set_cache_compression( $value ) {
		global $cache_compression, $cache_path;

		$new_cache_compression = 0;
		if ( defined( 'WPSC_DISABLE_COMPRESSION' ) ) {
			$cache_compression = 0;
			wp_cache_setting( 'cache_compression', $cache_compression );

		} else {
			if ( 1 == $value ) {
				$new_cache_compression = 1;
			}

			if ( 1 == ini_get( 'zlib.output_compression' ) || "on" == strtolower( ini_get( 'zlib.output_compression' ) ) ) {
				return __( "You attempted to enable compression but `zlib.output_compression` is enabled. See #21 in the Troubleshooting section of the readme file.", 'wp-super-cache' );
			}

			if ( $new_cache_compression != $cache_compression ) {
				$cache_compression = $new_cache_compression;
				wp_cache_setting( 'cache_compression', $cache_compression );
				if ( function_exists( 'prune_super_cache' ) ) {
					prune_super_cache( $cache_path, true );
				}

				delete_option( 'super_cache_meta' );
			}
		}

		return null;
	}

	/**
	 * @param array $cache_pages
	 */
	protected function set_wp_cache_pages( $cache_pages ) {
		if ( ! is_array( $cache_pages ) ) {
			return;
		}

		$_POST['wp_edit_rejected_pages'] = 1;

		foreach ( $cache_pages as $page => $value ) {
			if ( $value ) {
				$_POST['wp_cache_pages'][ $page ] = 1;
			}
		}

		wp_cache_update_rejected_pages();
	}

	/**
	 * @param mixed $value
	 */
	protected function set_wp_rejected_uri( $value ) {
		$_REQUEST['wp_rejected_uri'] = $value;
		wp_cache_update_rejected_strings();
	}

	/**
	 * @param mixed $value
	 */
	protected function set_wp_accepted_files( $value ) {
		$_REQUEST['wp_accepted_files'] = $value;
		wp_cache_update_accepted_strings();
	}

	/**
	 * @param mixed $value
	 */
	protected function set_wp_rejected_user_agent( $value ) {
		$_REQUEST['wp_rejected_user_agent'] = $value;
		wp_cache_update_rejected_ua();
	}

	/**
	 * @param mixed $value
	 */
	protected function set_ossdl_cname( $value ) {
		update_option( 'ossdl_cname', $value );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_ossdl_off_cdn_url( $value ) {
		update_option( 'ossdl_off_cdn_url', $value );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_ossdl_off_include_dirs( $value ) {
		update_option( 'ossdl_off_include_dirs', $value == '' ? 'wp-content,wp-includes' : $value );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_ossdl_off_exclude( $value ) {
		update_option( 'ossdl_off_exclude', $value );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_ossdl_https( $value ) {
		update_option( 'ossdl_https', $value ? 1 : 0 );
	}

	/**
	 * @param mixed $value
	 */
	protected function set_ossdlcdn( $value ) {
		global $wp_cache_config_file;

		$ossdlcdn = $value ? 1 : 0;
		wp_cache_replace_line( '^ *\$ossdlcdn', "\$ossdlcdn = $ossdlcdn;", $wp_cache_config_file );
	}

	/**
	 * @param mixed $value
	 * @param string $name
	 */
	protected function set_time_setting( $value, $name ) {
		$_POST[ $name ]         = $value;
		$_POST['_time_setting'] = true;
	}

	/**
	 * @param mixed $value
	 * @param string $name
	 */
	protected function set_preload_setting( $value, $name ) {
		$_POST[ $name ]            = $value;
		$_POST['_preload_setting'] = true;
	}

	/**
	 * Easy caching is a mode that allows the user to press one button and
	 * enable a sensible default of settings.
	 *
	 * @param bool $enabled
	 */
	protected function toggle_easy_caching( $enabled = true ) {
		global $cache_path, $wp_cache_shutdown_gc;
		if ( $enabled ) {
			$settings = array(
				'wp_cache_mobile_enabled' => 1,
				'wp_cache_status'         => 1,
				'super_cache_enabled'     => 2,
				'cache_rebuild_files'     => 1,
				'cache_compression'       => 0,
			);

			// set up garbage collection with some default settings
			if ( ( ! isset( $wp_cache_shutdown_gc ) || $wp_cache_shutdown_gc == 0 ) && false == wp_next_scheduled( 'wp_cache_gc' ) ) {
				if ( false == isset( $cache_schedule_type ) ) {
					$cache_schedule_type     = 'interval';
					$cache_time_interval     = 600;
					$cache_max_time          = 1800;
					$cache_schedule_interval = 'hourly';
					$cache_gc_email_me       = 0;
					wp_cache_setting( 'cache_schedule_type', $cache_schedule_type );
					wp_cache_setting( 'cache_time_interval', $cache_time_interval );
					wp_cache_setting( 'cache_max_time', $cache_max_time );
					wp_cache_setting( 'cache_schedule_interval', $cache_schedule_interval );
					wp_cache_setting( 'cache_gc_email_me', $cache_gc_email_me );
				}

				wp_schedule_single_event( time() + 600, 'wp_cache_gc' );
			}

		} else {
			$settings = array( 'super_cache_enabled' => 0 );
			wp_clear_scheduled_hook( 'wp_cache_check_site_hook' );
			wp_clear_scheduled_hook( 'wp_cache_gc' );
			wp_clear_scheduled_hook( 'wp_cache_gc_watcher' );
		}

		foreach ( $settings as $key => $value ) {
			$this->set_value_by_key( $value, $key );
		}

		if ( $cache_path != WP_CONTENT_DIR . '/cache/' ) {
			$this->set_value_by_key( $cache_path, 'wp_cache_location' );
		}

		$advanced_settings = array(
			'wp_super_cache_late_init',
			'wp_cache_disable_utf8',
			'wp_cache_no_cache_for_get',
			'wp_supercache_304',
			'wp_cache_mfunc_enabled',
			'wp_cache_mobile_enabled',
			'wp_cache_front_page_checks',
			'wp_supercache_cache_list',
			'wp_cache_hello_world',
			'wp_cache_clear_on_post_edit',
			'wp_cache_not_logged_in',
			'wp_cache_make_known_anon',
			'wp_cache_object_cache',
			'wp_cache_refresh_single_only',
			'cache_compression',
			'wp_cache_mutex_disabled'
		);

		foreach ( $advanced_settings as $setting ) {
			global ${$setting};

			$value = ( isset( $$setting ) && $$setting == 1 ) ? 1 : 0;
			$this->set_value_by_key( $value, $setting );
		}
	}

	/**
	 * Runs at the end and saves the time settings.
	 */
	protected function save_time_settings() {
		if ( ! isset( $_POST['_time_setting'] ) || true !== $_POST['_time_setting'] ) {
			return;
		}

		$_POST['action'] = 'expirytime';

		$all_time_settings = array(
			'cache_max_time',
			'cache_schedule_type',
			'cache_scheduled_time',
			'cache_schedule_interval',
			'cache_time_interval',
			'cache_gc_email_me'
		);

		foreach ( $all_time_settings as $time_setting ) {
			global ${$time_setting};
			if ( false == isset( $_POST[ $time_setting ] ) || $$time_setting == $_POST[ $time_setting ] ) {
				$_POST[ $time_setting ] = $$time_setting; // fill in the potentially missing fields before updating GC settings.
			}
		}

		if ( isset( $parameters['cache_gc_email_me'] ) && $parameters['cache_gc_email_me'] == 0 ) {
			unset( $_POST['cache_gc_email_me'] );
		}

		wp_cache_time_update();
	}


	/**
	 * Runs at the end and saves the preload settings.
	 */
	protected function save_preload_settings() {
		if ( ! isset( $_POST['_preload_setting'] ) || true !== $_POST['_preload_setting'] ) {
			return;
		}

		$_POST['action'] = 'preload';

		$all_preload_settings = array(
			'wp_cache_preload_interval',
			'wp_cache_preload_on',
			'wp_cache_preload_taxonomies',
			'wp_cache_preload_email_volume',
			'wp_cache_preload_posts',
			'wp_cache_preload_on'
		);

		foreach ( $all_preload_settings as $key ) {
			if ( ! isset( $_POST[ $key ] ) ) {
				global ${$key};
				$_POST[ $key ] = $$key;

			} elseif ( $_POST[ $key ] == 0 ) {
				unset( $_POST[ $key ] );
			}
		}

		wpsc_preload_settings();
	}
}
