import { __, sprintf } from '@wordpress/i18n';
import { REST_API_SITE_PRODUCTS_ENDPOINT } from '../constants';
import useSimpleMutation from '../use-simple-mutation';
import useProduct from './use-product';

const useInstallStandalonePlugin = ( productId: string ) => {
	const { detail, refetch } = useProduct( productId );

	const { mutate: install, isPending } = useSimpleMutation(
		'installPlugin',
		{
			path: `${ REST_API_SITE_PRODUCTS_ENDPOINT }/${ productId }/install-standalone`,
			method: 'POST',
		},
		{
			onSuccess: refetch,
		},
		null,
		sprintf(
			// translators: %$1s: Jetpack Product name
			__( 'Failed to install standalone plugin for %1$s. Please try again', 'jetpack-my-jetpack' ),
			detail.name
		)
	);

	return {
		install,
		isPending,
	};
};

export default useInstallStandalonePlugin;
