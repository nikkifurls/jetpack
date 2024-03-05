import { useContext, useEffect } from 'react';
import { NoticeContext } from '../../context/notices/noticeContext';

type Notice = {
	name: string;
	message: string;
	options: { status: string };
	isError: boolean;
};

// We don't want to show these error messages to the user
// The product cards themselves handle this well enough
const noticesToSuppress = [ 'statsCounts', 'videopressStats' ];

const useNotice = ( { name, message, options, isError }: Notice ) => {
	const { setCurrentNotice } = useContext( NoticeContext );
	const shouldSuppress = noticesToSuppress.includes( name );

	useEffect( () => {
		if ( isError && ! shouldSuppress ) {
			setCurrentNotice?.( { message, options } );
		}
		// We only want to update the notice if isError changes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ isError ] );
};

export default useNotice;
