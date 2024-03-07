#!/usr/bin/env node --no-warnings

// Get process vars set before import
import '../lib/setup.js'
import config from 'config'
import promptSync from 'prompt-sync'
// This is so that we don't have the version in multiple places.
import packageJson from '../package.json' assert {type: 'json'}
import {program} from 'commander';
import fs from 'node:fs'
import toolSupportCreate from '../lib/tool-support.js'
import canvasCreate from '../lib/canvas.js'
import {homedir} from "node:os";


const [major, minor, patch] = process.versions.node.split('.').map(Number)
if (major < 18) {
    console.error(`Requires Node 18 (or higher, ${major} found)`);
    process.exit(1)
}

// Allow ^C to interrupt
const prompt = promptSync({sigint: true})

function shouldRetry() {
    const abort = prompt('Abort? [y/n] ')
    if (abort === 'y' || abort === 'Y') {
        process.exit(1)
    }
    return true
}

async function validateToolSupportUrl(toolSupportUrl, toolSupportUsername, toolSupportPassword) {
    try {
        const response = await fetch(`${toolSupportUrl}/admin/tools`, {headers: {'Authorization': 'Basic ' + btoa(toolSupportUsername + ':' + toolSupportPassword)}})
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Failed to find endpoint.')
            }
            if (response.status === 401) {
                throw new Error('Invalid token.')
            }
            throw new Error(`Unknown error: ${response.status}`)
        }
        return true
    } catch (e) {
        if (e.cause && e.cause.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
            console.log('Untrusted certificate in chain.')
        } else if (e.code === 'ERR_INVALID_URL') {
            // Happens for invalid URL
            console.log('Invalid Canvas URL.')
        } else {
            console.log(e.message)
        }
    }
    return false;
}

async function validateCanvasUrl(canvasUrl, canvasToken) {
    try {
        // Using fetch as then we could use the code in browser possibly?
        const response = await fetch(`${canvasUrl}/api/v1/users/self`, {headers: {Authorization: `Bearer ${canvasToken}`}})
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Failed to find endpoint.')
            }
            if (response.status === 401) {
                throw new Error('Invalid token.')
            }
            throw new Error(`Unknown error: ${response.status}`)
        }
        return true
    } catch (e) {
        if (e.cause && e.cause.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
            console.log('Untrusted certificate in chain')
        }
        if (e.code === 'ERR_INVALID_URL') {
            console.log('Invalid Canvas URL.')
        } else {
            // Happens for invalid URL
            console.log(e.message)
        }
    }
    return false;
}

/**
 * Validates that we have the essential config set.
 */
const validateConfig = () => {
    try {
        checkDefined('canvas_url')
        checkDefined('canvas_token')

        checkDefined('tool_support_url')
        checkDefined('tool_support_username')
        checkDefined('tool_support_password')
    } catch (e) {
        console.error('Configuration missing, please run `init`:' + e.message)
        process.exit(1)
    }
}

const checkDefined = (key) => {
    const value = configValue(key)
    if (!value) {
        throw new Error(`Error: ${key} is not defined`)
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


const valueMappings = {
    'proxy_server_url': 'tool_support_url',
    'lti_server_url': 'tool_support_url',
    'lti_user': 'tool_support_username',
    'lti_password': 'tool_support_password',

}

/**
 * Is this value generated dynamically as the application runs (so don't replace it with a user value).
 */
const ignoredValue = (value) => {
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

const lookupValue = (key) => {
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
        }
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

program
    .name('index.js')
    .version(packageJson.version)
    .description('Contains a set of CLI tools to auto-provision LTI tools to Canvas')

program
    .command('init [environment]')
    .description('initialise the tool, optionally passing the environment to use')
    .action(async (environment = 'default') => {
        // This sets up the basic things needed for the program.
        console.log(`Initialising configuration (${environment}).`);
        const configDir = `${homedir}/.tool-config`
        const configFile = `${configDir}/${environment}.json`
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir)
        }
        if (fs.existsSync(configFile)) {
            console.log(`Configuration already exists (${configFile}), remove it first if you want to re-initialise`)
            process.exit(1)
        }

        let toolSupportUrl, toolSupportUsername, toolSupportPassword
        do {
            toolSupportUrl = prompt('Tool Support URL? ')
            toolSupportUsername = prompt('Tool Support Username? ')
            toolSupportPassword = prompt('Tool Support Password? ')
        } while (!await validateToolSupportUrl(toolSupportUrl, toolSupportUsername, toolSupportPassword) && shouldRetry());
        console.log('Tool Support connection validated.');

        let canvasUrl, canvasToken
        do {
            // Now read the things we need.
            canvasUrl = prompt('Canvas URL? ');
            canvasToken = prompt('Canvas token? ');
        } while (!await validateCanvasUrl(canvasUrl, canvasToken) && shouldRetry());
        console.log('Canvas connection validated.');

        const data = {
            setup: {
                canvas_url: canvasUrl,
                tool_support_url: toolSupportUrl
            },
            secrets: {
                canvas_token: canvasToken,
                tool_support_username: toolSupportUsername,
                tool_support_password: toolSupportPassword
            }
        }
        fs.writeFileSync(configFile, JSON.stringify(data, null, 4))
        console.log(`Written config to ${configFile}`)
        if (environment !== 'default') {
            console.log(`Use environment by specifying NODE_ENV=${environment} as environmental variable`)
        }
    })
program
    .command('setup')
    .description('Set additional values needed for this tool.')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .action((options) => {
        validateConfig()
        let jsonTemplate
        try {
            jsonTemplate = fs.readFileSync(options.template, 'utf8');
        } catch (e) {
            console.error(`Failed to read template file ${options.template}. ${e.message}`)
            process.exit(1)
        }
        // Just need this while replacing values, these are the default values.
        const templateConfig = JSON.parse(jsonTemplate).config

        const localConfig = {}

        const template = jsonTemplate.replace(/\$([A-Z_]{2,})|\${([A-Z_]+)}/g, ((match, rawName, wrappedName) => {
            const name = (rawName || wrappedName).toLocaleLowerCase()
            if (ignoredValue(name)) {
                return match;
            }
            const value = localConfig[name] || lookupValue(name) || templateConfig[name]
            if (!value) {
                localConfig[name] = prompt(`Value for ${name}? `)
            }
        }))
        if (Object.keys(localConfig).length) {

            if (!fs.existsSync('tool-config')) {
                fs.mkdirSync('tool-config')
            }
            const path = `./tool-config/local.json`;
            fs.writeFileSync(path, JSON.stringify(localConfig, null, 4))
            console.log(`Written local config to ${path}`)
        } else {
            console.log('No undefined parameters')
        }
    })

program
    .command('create')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .action(async (options) => {
            validateConfig();
            let textTemplate
            try {
                textTemplate = fs.readFileSync(options.template, 'utf8');
            } catch (e) {
                console.error(`Failed to read template file ${options.template}. ${e.message}`)
                process.exit(1)
            }

            // Just need this while replacing values, these are the default values.
            let jsonTemplate = JSON.parse(textTemplate).config

            textTemplate = textTemplate.replace(/\$([A-Z_]{2,})|\${([A-Z_]+)}/g, ((match, rawName, wrappedName) => {
                const name = (rawName || wrappedName).toLocaleLowerCase()
                if (ignoredValue(name)) {
                    return match;
                }
                const value = lookupValue(name) || jsonTemplate[name]
                if (!value) {
                    throw new Error(`No values defined for ${name}`)
                }
                return value
            }))

            const toolSupportUrl = lookupValue('tool_support_url')
            const toolSupportUsername = lookupValue('tool_support_username')
            const toolSupportPassword = lookupValue('tool_support_password')

            const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
            const canvasUrl = lookupValue('canvas_url')
            const canvasToken = lookupValue('canvas_token')
            const canvasAccountId = lookupValue('canvas_account_id') || 'self'
            const canvas = canvasCreate(canvasUrl, canvasToken)


        console.log(textTemplate)
            jsonTemplate = JSON.parse(textTemplate)

            // Search in tool-support for an existing registration id, otherwise we end up creating multiple keys in Canvas
            const ltiRegistrationId = lookupValue('lti_registration_id') || jsonTemplate['lti_registration_id']
            const existingLtiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
            if (existingLtiToolRegistration) {
                throw new Error(`A registration with id '${ltiRegistrationId}' already exists, not creating any key.`);
            }
            // TODO assert we have the right parts in the template

            if (/(localhost)|(127.0.0.1)/.test(toolSupportUrl)) {
                const jwkUrl = jsonTemplate.ltiKey.tool_configuration.settings.public_jwk_url
                if (jwkUrl) {
                    const jwks = await retrieveJwk(jwkUrl);
                    const publicJwk = jwks.keys[0];
                    delete jsonTemplate.ltiKey.tool_configuration.settings.public_jwk_url;
                    jsonTemplate.ltiKey.tool_configuration.settings.public_jwk = publicJwk;
                    console.log(`Embedded key from ${jwkUrl} in LTI developer key`);
                }
            }


            const createdLtiDevKey = await canvas.createLtiDeveloperKey(jsonTemplate.ltiKey)
            const ltiDevId = createdLtiDevKey.developer_key.id;
            // This is an unreadable ID
            const ltiDevApiKey = createdLtiDevKey.developer_key.api_key;
            console.log(`LTI developer key created with id ${ltiDevId}`);

            textTemplate = textTemplate.replace(/\$([A-Z_]{2,})|\${([A-Z_]+)}/g, (match, rawName, wrappedName) => {
                const name = (rawName || wrappedName).toLocaleLowerCase()
                switch (name) {
                    case 'lti_dev_id':
                        return ltiDevId;
                    case 'lti_dev_key':
                        return ltiDevApiKey;
                    default:
                        return match;
                }
            })
            jsonTemplate = JSON.parse(textTemplate)

            let apiDevId, apiDevApiKey
            if (jsonTemplate.apiKey) {
                if (jsonTemplate.toolReg.proxy) {
                    const createdApiDevKey = await canvas.createApiDeveloperKey(jsonTemplate.apiKey);
                    apiDevId = createdApiDevKey.id
                    apiDevApiKey = createdApiDevKey.api_key
                    console.log(`API developer key created with id ${apiDevId}`);
                    textTemplate = textTemplate.replace(/\$([A-Z_]{2,})|\${([A-Z_]+)}/g, (match, rawName, wrappedName) => {
                        const name = (rawName || wrappedName).toLocaleLowerCase()
                        switch (name) {
                            case 'api_dev_id':
                                return apiDevId;
                            case 'api_dev_key':
                                return apiDevApiKey;
                            default:
                                return match;
                        }
                    })
                    jsonTemplate = JSON.parse(textTemplate)
                } else {
                    // If we don't skip on creation then we end up leaving it on deletion.
                    console.warn(`No API key in tool support registration`)
                }
            }

            // Once the developer keys are enabled we can create the registrations in the LTI auth server.
            const toolSupportRegistration = await toolSupport.createLtiToolRegistration(jsonTemplate.toolReg);
            const toolSupportRegistrationId = toolSupportRegistration.id;
            console.log(`Tool Support registration created with id ${toolSupportRegistrationId}`);

            // Once we have the developer keys, we have to enable them.
            await canvas.enableDeveloperKey(ltiDevId);
            console.log(`LTI developer key enabled with id ${ltiDevId}`);
            if (jsonTemplate.apiKey && apiDevId) {
                await canvas.enableDeveloperKey(apiDevId);
                console.log(`API developer key enabled with id ${apiDevId}`);
            }


            // Finally we just need to add the LTI tool to the testing subaccount
            const externalTool = await canvas.addLtiToolToTestingSubaccount(ltiDevId, canvasAccountId);
            console.log(`LTI tool with id ${ltiDevId} added to the sub-account ${canvasAccountId} on ${canvasUrl}.`);
        }
    )
program
    .command('delete')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .action(async (options) => {
        validateConfig();
        let textTemplate
        try {
            textTemplate = fs.readFileSync(options.template, 'utf8');
        } catch (e) {
            console.error(`Failed to read template file ${options.template}. ${e.message}`)
            process.exit(1)
        }

        // Just need this while replacing values, these are the default values.
        let jsonTemplate = JSON.parse(textTemplate).config

        textTemplate = textTemplate.replace(/\$([A-Z_]{2,})|\${([A-Z_]+)}/g, ((match, rawName, wrappedName) => {
            const name = (rawName || wrappedName).toLocaleLowerCase()
            if (ignoredValue(name)) {
                return match;
            }
            const value = lookupValue(name) || jsonTemplate[name]
            if (!value) {
                throw new Error(`No values defined for ${name}`)
            }
            return value
        }))

        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
        const canvasUrl = lookupValue('canvas_url')
        const canvasToken = lookupValue('canvas_token')
        const canvasAccountId = lookupValue('canvas_account_id') || 'self'
        const canvas = canvasCreate(canvasUrl, canvasToken)

        const ltiRegistrationId = lookupValue('lti_registration_id') || jsonTemplate['lti_registration_id']

        // Search in the LTI auth server for the key to delete it.
        const ltiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
        if (!ltiToolRegistration) {
            throw new Error(`A registration with id '${ltiRegistrationId}' does not exists, not deleting any key.`);
        }

        const ltiToolRegistrationId = ltiToolRegistration.id;
        console.log(`LTI registration found with id ${ltiToolRegistrationId}`);

        const hasLtiKey = ltiToolRegistration.lti !== null;
        const hasProxyKey = ltiToolRegistration.proxy !== null;

        if (hasLtiKey) {
            const canvasLtiKeyToDelete = ltiToolRegistration.lti.clientId;
            console.log(`Deleting the LTI developer key ${canvasLtiKeyToDelete}...`);
            try {
                // Delete the developer key from Canvas.
                await canvas.deleteDeveloperKeyById(canvasLtiKeyToDelete);
                console.log(`Developer key ${canvasLtiKeyToDelete} deleted successfully.`);
            } catch (error) {
                console.log(error);
            }
        }

        if (hasProxyKey) {
            const canvasApiKeyToDelete = ltiToolRegistration.proxy.clientId;
            console.log(`Deleting the API developer key ${canvasApiKeyToDelete}....`);
            try {
                // Delete the developer key from Canvas.
                await canvas.deleteDeveloperKeyById(canvasApiKeyToDelete);
                console.log(`Developer key ${canvasApiKeyToDelete} deleted successfully.`);
            } catch (error) {
                console.log(error);
            }
        }

        // Now delete the LTI tool registration.
        await toolSupport.deleteLtiToolRegistration(ltiToolRegistrationId);
        console.log(`LTI registration ${ltiToolRegistrationId} deleted successfully.`);
    })

program
    .command('update')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .action(async (options) => {
        validateConfig();
        let textTemplate
        try {
            textTemplate = fs.readFileSync(options.template, 'utf8');
        } catch (e) {
            console.error(`Failed to read template file ${options.template}. ${e.message}`)
            process.exit(1)
        }

        // Just need this while replacing values, these are the default values.
        let jsonConfig = JSON.parse(textTemplate).config

        textTemplate = textTemplate.replace(/\$([A-Z_]{2,})|\${([A-Z_]+)}/g, ((match, rawName, wrappedName) => {
            const name = (rawName || wrappedName).toLocaleLowerCase()
            if (ignoredValue(name)) {
                return match;
            }
            const value = lookupValue(name) || jsonConfig[name]
            if (!value) {
                throw new Error(`No values defined for ${name}`)
            }
            return value
        }))

        let jsonTemplate = JSON.parse(textTemplate)


        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
        const canvasUrl = lookupValue('canvas_url')
        const canvasToken = lookupValue('canvas_token')
        const canvasAccountId = lookupValue('canvas_account_id') || 'self'
        const canvas = canvasCreate(canvasUrl, canvasToken)

        const ltiRegistrationId = lookupValue('lti_registration_id') || jsonConfig['lti_registration_id']

        // Search in the LTI auth server for the key to delete it.
        const ltiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
        if (!ltiToolRegistration) {
            throw new Error(`A registration with id '${ltiRegistrationId}' does not exists, not updating anything.`);
        }
        const ltiToolRegistrationId = ltiToolRegistration.id;
        console.log(`LTI registration found with id ${ltiToolRegistrationId}`);

        if (/(localhost)|(127.0.0.1)/.test(toolSupportUrl)) {
            const jwkUrl = jsonTemplate.ltiKey.tool_configuration.settings.public_jwk_url
            if (jwkUrl) {
                const jwks = await retrieveJwk(jwkUrl);
                const publicJwk = jwks.keys[0];
                delete jsonTemplate.ltiKey.tool_configuration.settings.public_jwk_url;
                jsonTemplate.ltiKey.tool_configuration.settings.public_jwk = publicJwk;
                console.log(`Embedded key from ${jwkUrl} in LTI developer key`);
            }
        }
        const canvasLtiKeyExisting = ltiToolRegistration.lti.clientId;
        console.log(`Updating the LTI developer key ${canvasLtiKeyExisting}...`);
        try {
            // Update the developer key from Canvas.
            await canvas.updateLtiDeveloperKey(canvasLtiKeyExisting, jsonTemplate.ltiKey);
            console.log(`Developer key ${canvasLtiKeyExisting} updated successfully.`);
        } catch (error) {
            console.log(error);
        }

        let ltiDevId, ltiDevApiKey;
        ltiDevId = ltiToolRegistration.lti.clientId;
        ltiDevApiKey = ltiToolRegistration.lti.clientSecret
        let apiDevId, apiDevApiKey;

        // Add/Delete/Update
        if (jsonTemplate.apiKey) {
            if (ltiToolRegistration.proxy) {
                // Need to update existing
                apiDevId = ltiToolRegistration.proxy.clientId
                apiDevApiKey = ltiToolRegistration.proxy.clientSecret
                console.log(`Updating the API developer key ${apiDevId}....`);
                // Update the developer key from Canvas.
                await canvas.updateApiDeveloperKey(apiDevId, jsonTemplate.apiKey);
                console.log(`Developer key ${apiDevId} updated successfully.`);
            } else {
                // Need to add it.
                const createdApiDevKey = await canvas.createApiDeveloperKey(jsonTemplate.apiKey);
                apiDevId = createdApiDevKey.id
                apiDevApiKey = createdApiDevKey.api_key
                console.log(`API developer key created with id ${apiDevId}`);
            }
        } else {
            if (ltiToolRegistration.proxy) {
                // Need to delete it then
                const canvasApiKeyToDelete = ltiToolRegistration.proxy.clientId;
                console.log(`Deleting the API developer key ${canvasApiKeyToDelete}....`);
                // Delete the developer key from Canvas.
                await canvas.deleteDeveloperKeyById(canvasApiKeyToDelete);
                console.log(`Developer key ${canvasApiKeyToDelete} deleted successfully.`);
            }
        }

        textTemplate = textTemplate.replace(/\$([A-Z_]{2,})|\${([A-Z_]+)}/g, (match, rawName, wrappedName) => {
            const name = (rawName || wrappedName).toLocaleLowerCase()
            switch (name) {
                case 'lti_dev_id':
                    return ltiDevId;
                case 'lti_dev_key':
                    return ltiDevApiKey;
                case 'api_dev_id':
                    return apiDevId;
                case 'api_dev_key':
                    return apiDevApiKey;
                default:
                    return match;
            }
        })
        jsonTemplate = JSON.parse(textTemplate)
        
        // Then update the tool registration 
        await toolSupport.updateLtiToolRegistration(ltiToolRegistrationId, jsonTemplate.toolReg);
        console.log(`LTI registration ${ltiToolRegistrationId} updated successfully.`);
    })

program.action(() => {
    console.log(`No command has been provided.`);
    program.help()
})
program.parse()

const retrieveJwk = async (jwkUrl) => {
    return await fetch(jwkUrl)
        .then(response => {
            if (response.ok) {
                return response
            }
            throw new Error(`Bad HTTP response: ${response.status}`)
        })
        .then(response => response.json())
        .catch(error => {
            throw new Error(`Error loading ${jwkUrl} of: ${error}`)
        })
}
