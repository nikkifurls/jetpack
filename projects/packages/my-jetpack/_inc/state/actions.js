/*
 * Action constants
 */
const SET_STATS_COUNTS_IS_FETCHING = 'SET_STATS_COUNTS_IS_FETCHING';
const SET_STATS_COUNTS = 'SET_STATS_COUNTS';

const SET_GLOBAL_NOTICE = 'SET_GLOBAL_NOTICE';
const CLEAN_GLOBAL_NOTICE = 'CLEAN_GLOBAL_NOTICE';

const setStatsCountsIsFetching = isFetching => {
	return { type: SET_STATS_COUNTS_IS_FETCHING, isFetching };
};

const setStatsCounts = statsCounts => ( { type: SET_STATS_COUNTS, statsCounts } );

const setGlobalNotice = ( message, options ) => ( {
	type: 'SET_GLOBAL_NOTICE',
	message,
	options,
} );

const cleanGlobalNotice = () => ( { type: 'CLEAN_GLOBAL_NOTICE' } );

const noticeActions = {
	setGlobalNotice,
	cleanGlobalNotice,
};

const actions = {
	setStatsCounts,
	setStatsCountsIsFetching,
	...noticeActions,
};

export {
	SET_GLOBAL_NOTICE,
	CLEAN_GLOBAL_NOTICE,
	SET_STATS_COUNTS_IS_FETCHING,
	SET_STATS_COUNTS,
	actions as default,
};
