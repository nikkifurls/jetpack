import { ToggleControl } from '@wordpress/components';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import ConnectionIcon from '../connection-icon';

import './style.scss';

const ConnectionToggle = props => {
	const { className, checked, id, disabled, onChange, serviceName, label, profilePicture } = props;

	const wrapperClasses = classnames( 'components-connection-toggle', {
		'is-not-checked': ! checked,
		'is-disabled': disabled,
	} );

	return (
		<div className={ wrapperClasses }>
			<ConnectionIcon
				serviceName={ serviceName }
				label={ label }
				profilePicture={ profilePicture }
			/>
			<ToggleControl
				style={ { margin: 'auto' } }
				id={ id }
				className={ className }
				checked={ checked }
				label={ label }
				onChange={ onChange }
				disabled={ disabled }
			/>
		</div>
	);
};

ConnectionToggle.propTypes = {
	className: PropTypes.string,
	checked: PropTypes.bool,
	id: PropTypes.string.isRequired,
	disabled: PropTypes.bool,
	onChange: PropTypes.func,
	serviceName: PropTypes.string,
	label: PropTypes.string,
	profilePicture: PropTypes.string,
};

export default ConnectionToggle;
