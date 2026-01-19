// Get process vars set before import
import '../lib/setup.js'
import config from 'config'

/**
 * Validates that we have the essential config set.
 */
export const validateConfig = () => {
    try {
        const canvasUrl = checkDefined('canvas_url')
        checkDefined('canvas_token')

        const toolSupportUrl = checkDefined('tool_support_url')
        checkDefined('tool_support_username')
        checkDefined('tool_support_password')

        console.error(`Canvas URL: ${canvasUrl}`)
        console.error(`Tool Support URL: ${toolSupportUrl}`)
    } catch (e) {
        console.error('Configuration missing, please run `init`:' + e.message)
        process.exit(1)
    }
}

export const checkDefined = (key) => {
    const value = configValue(key)
    if (!value) {
        throw new Error(`Error: ${key} is not defined`)
    }
    return value
}

const configValue = (key) => {
    // This is an old way of splitting out the values
    if (config.has(`secrets.${key}`)) {
        return config.get(`secrets.${key}`)
    }
    // This is an old way of splitting out the values
    if (config.has(`setup.${key}`)) {
        return config.get(`setup.${key}`)
    }
    if (config.has(key)) {
        return config.get(key)
    }
    return undefined
}

// Captured once so that multiple substitutions during a single run share the same timestamp.
const currentDateTime = new Date().toISOString()

/**
 * Set default values. These normally come from the template and are only used when there isn't a value defined.
 */
export const setDefaultValues = (values) => {
    // The template might not have had any values.
    if (values) {
        for (let key in values) {
            // Copy values from the template into the config only if we don't have a value already for them
            if (!config.has((key))) {
                config[key] = values[key]
            }
        }
    }
}

/**
 * Sets the override values. These normally come from command line arguments.
 */
export const setOverrides = (values) => {
    if (values.ltiRegistrationId) {
        config.lti_registration_id = values.ltiRegistrationId
    }
}

// These are old variable substitutions that we need to support
const valueMappings = {
    'proxy_server_url': 'tool_support_url',
    'lti_server_url': 'tool_support_url',
    'lti_user': 'tool_support_username',
    'lti_password': 'tool_support_password',

}

/**
 * Is this value generated dynamically as the application runs (so don't replace it with a user value).
 */
export const ignoredValue = (value) => {
    switch (value) {
        case 'lti_dev_id':
        case 'lti_dev_key':
        case 'api_dev_id':
        case 'api_dev_key':
            return true;
        default:
            return false;
    }
}

/**
 * Work out the type of Canvas instance based on the canvas URL.
 * This will return prod/beta/test.
 */
const canvasType = (canvasUrl) => {
    if (canvasUrl.includes('.test.')) {
        return 'test';
    } else if (canvasUrl.includes('.beta.')) {
        return 'beta';
    } else {
        return 'prod'
    }
}

export const lookupValue = (key) => {
    let value = configValue(key)
    if (!value && valueMappings[key]) {
        value = configValue(valueMappings[key])
    }
    if (!value) {
        // Calculated values based on other values
        const type = canvasType(configValue('canvas_url'))
        switch (key) {
            case 'canvas_provider_url':
                value = {
                    'test': 'https://sso.test.canvaslms.com',
                    'beta': 'https://sso.beta.canvaslms.com',
                    'prod': 'https://sso.canvaslms.com'
                }[type]
                break;
            case 'canvas_issuer_uri':
                value = {
                    'test': 'https://canvas.test.instructure.com',
                    'beta': 'https://canvas.beta.instructure.com',
                    'prod': 'https://canvas.instructure.com',
                }[type]
                break;
            case 'current_datetime':
                value = currentDateTime
                break;
        }
    }
    return value
}
