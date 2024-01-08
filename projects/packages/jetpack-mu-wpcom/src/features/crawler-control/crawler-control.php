<?php
/**
 * Crawler Control
 *
 * @package automattic/jetpack-mu-wpcom
 */

add_action( 'plugins_loaded', 'wpcom_crawler_control' );

/**
 * Handles crawler control.
 */
function wpcom_crawler_control() {
	if ( wpcom_crawler_control_is_blog_crawlable() ) {
		return;
	}

	$user_agent             = ! empty( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : '';
	$disallowed_user_agents = array(
		'a8ctest',
		'GPTBot',
		'CCBot',
		'SentiBot',
		'sentibot',
		'Google-Extended',
		'FacebookBot',
		'omgili',
		'omgilibot',
		'Amazonbot',
		'Bingbot', // TODO special handling.
	);

	// Send a friendly message to the user agent.
	if ( in_array( $user_agent, $disallowed_user_agents, true ) ) {
		status_header( 403 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		echo 'Not allowed. TODO: Insert friendly message here.';
		exit;
	}
}

/**
 * Returns whether the current blog is crawlable.
 *
 * @return bool
 */
function wpcom_crawler_control_is_blog_crawlable() {
	if ( defined( 'IS_WPCOM' ) && IS_WPCOM ) {
		return get_blog_option( get_current_blog_id(), 'wpcom_is_crawlable' );
	}

	return get_option( 'wpcom_is_crawlable' );
}
