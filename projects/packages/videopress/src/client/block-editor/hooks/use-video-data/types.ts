import { VideoGUID, VideoId } from '../../blocks/video/types';

export type UseVideoDataArgumentsProps = {
	id?: VideoId;
	guid?: VideoGUID;
};

export type videoDataProps = {
	title?: string;
	description?: string;
};

export type UseVideoDataProps = {
	videoData: videoDataProps;
	isRequestingVideoData: boolean;
};
