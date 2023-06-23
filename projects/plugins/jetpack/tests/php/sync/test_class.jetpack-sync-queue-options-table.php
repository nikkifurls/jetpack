<?php

use Automattic\Jetpack\Sync\Queue;

require_once __DIR__ . '/class-test-jetpack-sync-queue-base-tests.php';

/**
 * @group jetpack-sync
 * @group jetpack-sync-queue
 */
class WP_Test_Jetpack_Sync_Queue_Options_Table extends WP_Test_Jetpack_Sync_Queue_Base_Tests {

	/**
	 * @var Queue
	 */
	public $queue;

	// Ignoring as Dev requirement is > PHP7
	// phpcs:ignore PHPCompatibility.FunctionDeclarations.NewReturnTypeDeclarations.voidFound
	public function setUp(): void {
		parent::setUp();

		// Disable the dedicated table, so we can run with the options table
		update_option( Queue::$use_dedicated_table_option_name, '-1' );
		$this->queue = new Queue( 'my_queue_options' );
		$this->queue->reset();
	}

	public function test_add_queue_item_is_not_set_to_autoload() {
		global $wpdb;
		$this->assertSame( 0, $this->queue->size() );
		$this->queue->add( 'foo' );

		$queue = $wpdb->get_row( "SELECT * FROM $wpdb->options WHERE option_name LIKE 'jpsq_my_queue%'" );

		$this->assertEquals( 'no', $queue->autoload );
	}
}
