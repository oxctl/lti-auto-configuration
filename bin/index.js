#!/usr/bin/env node

import promptSync from 'prompt-sync'
import {program} from 'commander';
import fs from 'node:fs'
import path from 'node:path'
import toolSupportCreate from '../lib/tool-support.js'
import canvasCreate from '../lib/canvas.js'
import {homedir} from "node:os";
import {updateConfigDirForTemplate} from '../lib/setup.js'

import packageJson from '../package.json' with { type: 'json' }

// The pattern to search for in templates when replacing values.
const templateRegex = /\$([A-Z_]{2,})|\${([A-Z_]+)}/g;

// Lazy-load config utilities after NODE_CONFIG_DIR has been updated for the chosen template.
const loadConfig = async () => await import('../lib/config.js')

/**
 * Validates that we have the essential config set.
 */
const validateConfig = (configUtils) => {
    const {checkDefined} = configUtils
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

const [major, minor, patch] = process.versions.node.split('.').map(Number)
if (major < 18) {
    console.error(`Requires Node 18 (or higher, ${major} found)`);
    process.exit(1)
}

// Allow ^C to interrupt
const promptFunc = promptSync({sigint: true})
// Always trim the input, so we don't have to worry about trailing spaces.
const prompt = (message, value, opts)=> promptFunc(message, value, opts).trim()

/**
 * Gets the LTI registration ID by client ID and unlocks it.
 */
const unlockLtiRegistrationByClientId = async (canvas, clientId) => {
    try {
        const canvasLtiRegistration = await canvas.getLtiRegistrationByClientId(clientId);
        const canvasLtiRegistrationId = canvasLtiRegistration.id;
        try {
            await canvas.unlockLtiDeveloperKey(canvasLtiRegistrationId);
            console.log(`LTI registration unlocked with id ${canvasLtiRegistrationId}`);
        } catch (error) {
            console.error(`Failed to unlock LTI registration: ${error.message}`);
            throw error;
        }
    } catch (error) {
        console.error(`Failed to get or unlock LTI registration: ${error.message}`);
        throw error;
    }
}

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
            console.log('Invalid Tool Support URL.')
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

program
    .name('lti-config')
    // This is only defined when running through npm (npx) and not when running directly
    // Using JSON imports is tool broken to support well across node versions.
    .version(`${packageJson.name} ${packageJson.version}` || 'unknown')
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
    .command('setup [environment]')
    .description('Set additional values needed for this tool, by default the NODE_ENV environmental variable will be used for the environment.')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .action(async (environment = process.env.NODE_ENV, {template}) => {
        updateConfigDirForTemplate(template)
        const {setDefaultValues, lookupValue, ignoredValue} = await loadConfig()
        
        let textTemplate
        try {
            textTemplate = fs.readFileSync(template, 'utf8');
        } catch (e) {
            console.error(`Failed to read template file ${template}. ${e.message}`)
            process.exit(1)
        }
        // Just need this while replacing values, these are the default values.
        const jsonTemplate = JSON.parse(textTemplate)
        setDefaultValues(jsonTemplate.config)

        const localConfig = {}

        console.log('Setting config'+ (environment ?` for environment: ${environment}`:'.'))
        
        const filename = environment ? `local-${environment}.json` : 'local.json'
        // Use the same directory as the template
        const templateDir = path.dirname(template)
        const configPath = path.join(templateDir, filename)
        let existingConfig = {}
        if (fs.existsSync(configPath)) {
            try {
                console.log(`Loading config from ${configPath}`)
                existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
            } catch (e) {
                console.error(`Failed to read setup config ${configPath}. ${e.message}`)
                process.exit(1) 
            }
        }

        textTemplate.replace(templateRegex, ((match, rawName, wrappedName) => {
            const name = (rawName || wrappedName).toLocaleLowerCase()
            if (ignoredValue(name)) {
                return match;
            }
            const value = localConfig[name] || lookupValue(name) 
            const existingValue = existingConfig[name]
            if (!value || (existingValue && !localConfig[name]) ) {
                localConfig[name] = prompt(`Value for ${name}? [default: ${existingValue}] `, existingValue)
            }
        }))
        if (Object.keys(localConfig).length) {

            if (!fs.existsSync(templateDir)) {
                fs.mkdirSync(templateDir, { recursive: true })
            }
            fs.writeFileSync(configPath, JSON.stringify(localConfig, null, 4))
            console.log(`Written local config to ${configPath}`)
        } else {
            console.log('No undefined parameters')
        }
    })

/**
 * Module-level logger. Commands switch log to stderr when running in JSON output mode.
 */
const logger = {
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args)
}

/**
 * Emits JSON summary when command is running in JSON output mode.
 */
function emitJsonSummary(jsonOutput, summary) {
    if (jsonOutput) {
        process.stdout.write(`${JSON.stringify(summary)}\n`)
    }
}

/**
 * Embeds JWK from public_jwk_url if running on localhost
 */
async function embedJwkIfLocalhost(toolSupportUrl, jsonTemplate) {
    if (/(localhost)|(127.0.0.1)/.test(toolSupportUrl)) {
        const jwkUrl = jsonTemplate.ltiKey?.tool_configuration?.settings?.public_jwk_url
        if (jwkUrl) {
            const jwks = await retrieveJwk(jwkUrl)
            const publicJwk = jwks.keys[0]
            delete jsonTemplate.ltiKey.tool_configuration.settings.public_jwk_url
            jsonTemplate.ltiKey.tool_configuration.settings.public_jwk = publicJwk
            logger.log(`Embedded key from ${jwkUrl} in LTI developer key`)
        }
    }
}

/**
 * Replaces template variables with developer key IDs
 */
function replaceKeyIds(template, keyIds) {
    const { ltiDevId, ltiDevApiKey, apiDevId, apiDevApiKey } = keyIds
    return template.replace(templateRegex, (match, rawName, wrappedName) => {
        const name = (rawName || wrappedName).toLocaleLowerCase()
        switch (name) {
            case 'lti_dev_id':
                return ltiDevId || match
            case 'lti_dev_key':
                return ltiDevApiKey || match
            case 'api_dev_id':
                return apiDevId || match
            case 'api_dev_key':
                return apiDevApiKey || match
            default:
                return match
        }
    })
}

/**
 * Updates a developer key (LTI or API) with error handling and logging
 */
async function updateDeveloperKey(canvas, keyType, keyId, keyConfig) {
    try {
        const method = keyType === 'lti' ? 'updateLtiDeveloperKey' : 'updateApiDeveloperKey'
        await canvas[method](keyId, keyConfig)
        logger.log(`${keyType === 'lti' ? 'LTI' : 'API'} developer key ${keyId} updated successfully`)
        return true
    } catch (error) {
        logger.error(error)
        return false
    }
}

/**
 * Handles API key lifecycle: create new, update existing, or delete if not in template
 * Returns { apiDevId, apiDevApiKey, enableApiKey }
 */
async function handleApiKeyLifecycle(canvas, jsonTemplate, existingRegistration) {
    const result = { apiDevId: null, apiDevApiKey: null, enableApiKey: false }
    
    if (jsonTemplate.apiKey) {
        if (existingRegistration?.proxy) {
            // Update existing API key
            result.apiDevId = existingRegistration.proxy.clientId
            result.apiDevApiKey = existingRegistration.proxy.clientSecret
            logger.log(`Updating the API developer key ${result.apiDevId}...`)
            await updateDeveloperKey(canvas, 'api', result.apiDevId, jsonTemplate.apiKey)
        } else {
            // Create new API key
            const createdApiDevKey = await canvas.createApiDeveloperKey(jsonTemplate.apiKey)
            result.apiDevId = createdApiDevKey.id
            result.apiDevApiKey = createdApiDevKey.api_key
            result.enableApiKey = true
            logger.log(`API developer key created with id ${result.apiDevId}`)
        }
    } else {
        if (existingRegistration?.proxy) {
            // Delete API key
            const canvasApiKeyToDelete = existingRegistration.proxy.clientId
            logger.log(`Deleting the API developer key ${canvasApiKeyToDelete}...`)
            try {
                await canvas.deleteDeveloperKeyById(canvasApiKeyToDelete)
                logger.log(`Developer key ${canvasApiKeyToDelete} deleted successfully`)
            } catch (error) {
                logger.error(`Failed to delete developer key ${canvasApiKeyToDelete}: ${error.message}`)
            }
        }
    }
    
    return result
}

/**
 * Adds or verifies LTI tool in subaccount
 * Returns true if tool was added, false if already exists or skipped
 */
async function addOrVerifyLtiToolInSubaccount(canvas, ltiDevId, canvasLtiKeyId, canvasAccountId, canvasUrl) {
    if (canvasAccountId === 'none') {
        return { externalToolId: null }
    }
    
    const ltiTools = await canvas.getLtiTools(canvasAccountId)
    const localKeyId = (BigInt(canvasLtiKeyId) % BigInt("10000000000000")).toString()
    const ltiTool = ltiTools.find(tool => tool.developer_key_id === localKeyId || tool.developer_key_id === canvasLtiKeyId)
    
    if (!ltiTool) {
        await unlockLtiRegistrationByClientId(canvas, ltiDevId)
        const createdLtiTool = await canvas.addLtiToolToSubaccount(ltiDevId, canvasAccountId)
        logger.log(`LTI tool with id ${ltiDevId} added to the sub-account ${canvasAccountId} on ${canvasUrl}`)
        return { externalToolId: createdLtiTool?.id || null }
    }
    return { externalToolId: ltiTool.id || null }
}

/**
 * Common setup for create/update/deploy commands.
 * Loads config, parses template, and returns all necessary objects and data.
 */
async function setupTemplateCommand(templatePath, options) {
    updateConfigDirForTemplate(templatePath)
    const configUtils = await loadConfig()
    const {setDefaultValues, setOverrides, lookupValue, ignoredValue, checkDefined} = configUtils
    
    let originalTemplate
    try {
        originalTemplate = fs.readFileSync(templatePath, 'utf8')
    } catch (e) {
        console.error(`Failed to read template file ${templatePath}. ${e.message}`)
        process.exit(1)
    }
    
    let jsonTemplate = JSON.parse(originalTemplate)
    setOverrides(options)
    setDefaultValues(jsonTemplate.config)
    validateConfig(configUtils)
    
    let processedTemplate = originalTemplate.replace(templateRegex, ((match, rawName, wrappedName) => {
        const name = (rawName || wrappedName).toLocaleLowerCase()
        if (ignoredValue(name)) {
            return match
        }
        const value = lookupValue(name)
        if (!value && value !== '') {
            throw new Error(`No values defined for ${name}`)
        }
        return value
    }))
    
    jsonTemplate = JSON.parse(processedTemplate)
    
    const toolSupportUrl = lookupValue('tool_support_url')
    const toolSupportUsername = lookupValue('tool_support_username')
    const toolSupportPassword = lookupValue('tool_support_password')
    const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
    
    const canvasUrl = lookupValue('canvas_url')
    const canvasToken = lookupValue('canvas_token')
    const canvasAccountId = lookupValue('canvas_account_id') || 'self'
    const canvas = canvasCreate(canvasUrl, canvasToken)
    
    const ltiRegistrationId = checkDefined('lti_registration_id')
    
    return {
        originalTemplate,
        processedTemplate,
        jsonTemplate,
        configUtils,
        toolSupport,
        canvas,
        toolSupportUrl,
        canvasUrl,
        canvasAccountId,
        ltiRegistrationId,
        lookupValue,
        ignoredValue,
        checkDefined
    }
}

program
    .command('create')
    .description('Adds the configuration to tool support and Canvas')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .option('-r, --lti-registration-id <ltiRegistrationId>', 'registration id to use')
    .option('-j, --json', 'output summary as JSON')
    .action(async (options) => {
            const jsonOutput = !!options.json
            if (jsonOutput) {
                logger.log = (...args) => console.error(...args)
            }
            updateConfigDirForTemplate(options.template)
            const configUtils = await loadConfig()
            const {setDefaultValues, setOverrides, lookupValue, ignoredValue, checkDefined} = configUtils
            
            let textTemplate
            try {
                textTemplate = fs.readFileSync(options.template, 'utf8');
            } catch (e) {
                console.error(`Failed to read template file ${options.template}. ${e.message}`)
                process.exit(1)
            }
            // Just need this while replacing values, these are the default values.
            let jsonTemplate = JSON.parse(textTemplate)
            setDefaultValues(jsonTemplate.config)
            setOverrides(options)
            
            validateConfig(configUtils);

            textTemplate = textTemplate.replace(templateRegex, ((match, rawName, wrappedName) => {
                const name = (rawName || wrappedName).toLocaleLowerCase()
                if (ignoredValue(name)) {
                    return match;
                }
                const value = lookupValue(name)
                // undefined and not zero length string
                if (!value && value !== '') {
                    throw new Error(`No values defined for ${name}`)
                }
                return value
            }))
        
            jsonTemplate = JSON.parse(textTemplate)

            const toolSupportUrl = lookupValue('tool_support_url')
            const toolSupportUsername = lookupValue('tool_support_username')
            const toolSupportPassword = lookupValue('tool_support_password')

            const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
            const canvasUrl = lookupValue('canvas_url')
            const canvasToken = lookupValue('canvas_token')
            const canvasAccountId = lookupValue('canvas_account_id') || 'self'
            const canvas = canvasCreate(canvasUrl, canvasToken)


            // Search in tool-support for an existing registration id, otherwise we end up creating multiple keys in Canvas
            const ltiRegistrationId = checkDefined('lti_registration_id')
            const existingLtiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
            if (existingLtiToolRegistration) {
                throw new Error(`A registration with id '${ltiRegistrationId}' already exists, not creating any key.`);
            }
            // TODO assert we have the right parts in the template

            await embedJwkIfLocalhost(toolSupportUrl, jsonTemplate)

            const createdLtiDevKey = await canvas.createLtiDeveloperKey(jsonTemplate.ltiKey)
            const ltiDevId = createdLtiDevKey.developer_key.id;
            // This is an unreadable ID
            const ltiDevApiKey = createdLtiDevKey.developer_key.api_key;
            logger.log(`LTI developer key created with id ${ltiDevId}`);

            textTemplate = replaceKeyIds(textTemplate, { ltiDevId, ltiDevApiKey })
            jsonTemplate = JSON.parse(textTemplate)

            let apiDevId, apiDevApiKey
            if (jsonTemplate.apiKey) {
               if (jsonTemplate.toolReg.proxy) {
                   const createdApiDevKey = await canvas.createApiDeveloperKey(jsonTemplate.apiKey);
                   apiDevId = createdApiDevKey.id
                   apiDevApiKey = createdApiDevKey.api_key
                   logger.log(`API developer key created with id ${apiDevId}`);
                   textTemplate = replaceKeyIds(textTemplate, { ltiDevId, ltiDevApiKey, apiDevId, apiDevApiKey })
                   jsonTemplate = JSON.parse(textTemplate)
               } else {
                   // If we don't skip on creation then we end up leaving it on deletion.
                   logger.warn(`No API key in tool support registration`)
               }
            }

            // Once the developer keys are enabled we can create the registrations in the LTI auth server.
            const toolSupportRegistration = await toolSupport.createLtiToolRegistration(jsonTemplate.toolReg);
            const toolSupportRegistrationId = toolSupportRegistration.id;
            logger.log(`Tool Support registration created with id ${toolSupportRegistrationId}`);

            // Once we have the developer keys, we have to enable them.
            await canvas.enableDeveloperKey(ltiDevId);
            logger.log(`LTI developer key enabled with id ${ltiDevId}`);
            if (jsonTemplate.apiKey && apiDevId) {
                await canvas.enableDeveloperKey(apiDevId);
                logger.log(`API developer key enabled with id ${apiDevId}`);
            }


            // Finally we just need to add the LTI tool to the testing subaccount
            const { externalToolId } = await addOrVerifyLtiToolInSubaccount(canvas, ltiDevId, ltiDevId, canvasAccountId, canvasUrl)
            emitJsonSummary(jsonOutput, {
                action: 'created',
                ltiRegistrationId,
                toolSupportRegistrationId,
                developerKeys: {
                    lti: { id: ltiDevId },
                    api: { id: apiDevId || null }
                },
                externalTools: {
                    lti: { id: externalToolId }
                }
            })
        }
    )
program
    .command('delete')
    .description('Deletes the configuration from tool support and Canvas')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .option('-r, --lti-registration-id <ltiRegistrationId>', 'registration id to use')
    .option('-n, --non-interactive', 'disable confirmation prompt')
    .action(async (options) => {
        updateConfigDirForTemplate(options.template)
        const configUtils = await loadConfig()
        const {setOverrides, setDefaultValues, lookupValue, checkDefined} = configUtils

        setOverrides(options)
        try {
            let textTemplate = fs.readFileSync(options.template, 'utf8');
            const jsonTemplate = JSON.parse(textTemplate)
            setDefaultValues(jsonTemplate.config)
        } catch (e) {
            // As we just need a registration ID  if there isn't a configuration file it's not a problem
            // as the value may have been passed in on the command line.
        }
        validateConfig(configUtils);

        // Just need this while replacing values, these are the default values.

        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
        const canvasUrl = lookupValue('canvas_url')
        const canvasToken = lookupValue('canvas_token')
        const canvas = canvasCreate(canvasUrl, canvasToken)

        const ltiRegistrationId = checkDefined('lti_registration_id')

        // Search in the LTI auth server for the key to delete it.
        const ltiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
        if (!ltiToolRegistration) {
            throw new Error(`A registration with id '${ltiRegistrationId}' does not exists, not deleting any key.`);
        }

        const ltiToolRegistrationId = ltiToolRegistration.id;
        console.log(`For ${canvasUrl}, the LTI registration for ${ltiRegistrationId} has been found with id ${ltiToolRegistrationId}`);

        // Confirmation prompt for delete operation
        if (!options.nonInteractive) {
            const confirmation = prompt('Are you sure you want to delete this configuration? This action cannot be undone. Type "Yes" to confirm: ');
            if (confirmation.toLowerCase() !== 'yes') {
                console.log('Delete operation cancelled.');
                process.exit(0);
            }
        }

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
                console.error(`Failed to delete developer key ${canvasLtiKeyToDelete}: ${error.message}`);
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
                console.error(`Failed to delete developer key ${canvasApiKeyToDelete}: ${error.message}`);
            }
        }

        // Now delete the LTI tool registration.
        await toolSupport.deleteLtiToolRegistration(ltiToolRegistrationId);
        console.log(`LTI registration ${ltiToolRegistrationId} deleted successfully.`);
    })

program
    .command('update')
    .description('Updates the the configuration in tool support and Canvas')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .option('-r, --lti-registration-id <ltiRegistrationId>', 'registration id to use')
    .option('-j, --json', 'output summary as JSON')
    .action(async (options) => {
        const jsonOutput = !!options.json
        if (jsonOutput) {
            logger.log = (...args) => console.error(...args)
        }
        updateConfigDirForTemplate(options.template)
        const configUtils = await loadConfig()
        const {setOverrides, setDefaultValues, lookupValue, ignoredValue, checkDefined} = configUtils
        
        let textTemplate
        try {
            textTemplate = fs.readFileSync(options.template, 'utf8');
        } catch (e) {
            console.error(`Failed to read template file ${options.template}. ${e.message}`)
            process.exit(1)
        }

        // Just need this while replacing values, these are the default values.
        let jsonTemplate = JSON.parse(textTemplate)
        setOverrides(options)
        setDefaultValues(jsonTemplate.config)
        validateConfig(configUtils);
        textTemplate = textTemplate.replace(templateRegex, ((match, rawName, wrappedName) => {
            const name = (rawName || wrappedName).toLocaleLowerCase()
            if (ignoredValue(name)) {
                return match;
            }
            const value = lookupValue(name)
            // undefined and not zero length string
            if (!value && value !== '') {
                throw new Error(`No values defined for ${name}`)
            }
            return value
        }))

        jsonTemplate = JSON.parse(textTemplate)
        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
        const canvasUrl = lookupValue('canvas_url')
        const canvasToken = lookupValue('canvas_token')
        const canvasAccountId = lookupValue('canvas_account_id') || 'self'
        const canvas = canvasCreate(canvasUrl, canvasToken)

        const ltiRegistrationId = checkDefined('lti_registration_id')

        // Search in the LTI auth server for the key to delete it.
        const ltiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
        if (!ltiToolRegistration) {
            throw new Error(`A registration with id '${ltiRegistrationId}' does not exists, not updating anything.`);
        }
        const ltiToolRegistrationId = ltiToolRegistration.id;
        logger.log(`LTI registration for ${ltiRegistrationId} found with id ${ltiToolRegistrationId}`);

        await embedJwkIfLocalhost(toolSupportUrl, jsonTemplate)
        const canvasLtiKeyExisting = ltiToolRegistration.lti.clientId;
        logger.log(`Updating the LTI developer key ${canvasLtiKeyExisting}...`);
        await updateDeveloperKey(canvas, 'lti', canvasLtiKeyExisting, jsonTemplate.ltiKey)

        let ltiDevId, ltiDevApiKey;
        ltiDevId = ltiToolRegistration.lti.clientId;
        ltiDevApiKey = ltiToolRegistration.lti.clientSecret
        let apiDevId, apiDevApiKey;
        let enableApiKey = false;

        // Handle API key lifecycle (create, update, or delete)
        const apiResult = await handleApiKeyLifecycle(canvas, jsonTemplate, ltiToolRegistration)
        apiDevId = apiResult.apiDevId
        apiDevApiKey = apiResult.apiDevApiKey
        enableApiKey = apiResult.enableApiKey

        textTemplate = replaceKeyIds(textTemplate, { ltiDevId, ltiDevApiKey, apiDevId, apiDevApiKey })
        jsonTemplate = JSON.parse(textTemplate)
        
        // Then update the tool registration 
        await toolSupport.updateLtiToolRegistration(ltiToolRegistrationId, jsonTemplate.toolReg);
        logger.log(`LTI registration ${ltiToolRegistrationId} updated successfully.`);

        if (enableApiKey) {
            // We added a new API key so now we've setup the tool support entry enable the key.
            await canvas.enableDeveloperKey(apiDevId);
            logger.log(`API developer key enabled with id ${apiDevId}`);
        }

        const { externalToolId } = await addOrVerifyLtiToolInSubaccount(canvas, ltiDevId, ltiToolRegistration.lti.clientId, canvasAccountId, canvasUrl)
        emitJsonSummary(jsonOutput, {
            action: 'updated',
            ltiRegistrationId,
            toolSupportRegistrationId: ltiToolRegistrationId,
            developerKeys: {
                lti: { id: ltiDevId },
                api: { id: apiDevId || null }
            },
            externalTools: {
                lti: { id: externalToolId }
            }
        })
    })

program
    .command('deploy')
    .description('Creates the configuration in tool support and Canvas if it doesn\'t exist, updates it if it does')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .option('-r, --lti-registration-id <ltiRegistrationId>', 'registration id to use')
    .option('-j, --json', 'output summary as JSON')
    .action(async (options) => {
        const jsonOutput = !!options.json
        if (jsonOutput) {
            logger.log = (...args) => console.error(...args)
        }
        try {
            const setup = await setupTemplateCommand(options.template, options)
            const { processedTemplate, jsonTemplate, toolSupport, canvas, canvasUrl, canvasAccountId, ltiRegistrationId, lookupValue } = setup
            
            // Check if tool exists
            const existingLtiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId)
            
            if (!existingLtiToolRegistration) {
                // Tool doesn't exist - run CREATE logic
                logger.log(`Tool registration '${ltiRegistrationId}' not found. Creating...`)
                
                await embedJwkIfLocalhost(lookupValue('tool_support_url'), jsonTemplate)
                
                // Create LTI developer key
                const createdLtiDevKey = await canvas.createLtiDeveloperKey(jsonTemplate.ltiKey)
                const ltiDevId = createdLtiDevKey.developer_key.id
                const ltiDevApiKey = createdLtiDevKey.developer_key.api_key
                logger.log(`LTI developer key created with id ${ltiDevId}`)
                
                // Update template with LTI key IDs
                let updatedTemplate = replaceKeyIds(processedTemplate, { ltiDevId, ltiDevApiKey })
                let updatedJsonTemplate = JSON.parse(updatedTemplate)
                
                // Handle API developer key if needed
                let apiDevId, apiDevApiKey
                if (updatedJsonTemplate.apiKey) {
                    if (updatedJsonTemplate.toolReg.proxy) {
                        const createdApiDevKey = await canvas.createApiDeveloperKey(updatedJsonTemplate.apiKey)
                        apiDevId = createdApiDevKey.id
                        apiDevApiKey = createdApiDevKey.api_key
                        logger.log(`API developer key created with id ${apiDevId}`)
                        updatedTemplate = replaceKeyIds(updatedTemplate, { ltiDevId, ltiDevApiKey, apiDevId, apiDevApiKey })
                        updatedJsonTemplate = JSON.parse(updatedTemplate)
                    } else {
                        logger.warn(`No API key in tool support registration`)
                    }
                }
                
                // Create tool registration in tool support
                const toolSupportRegistration = await toolSupport.createLtiToolRegistration(updatedJsonTemplate.toolReg)
                const toolSupportRegistrationId = toolSupportRegistration.id
                logger.log(`Tool Support registration created with id ${toolSupportRegistrationId}`)
                
                // Enable developer keys
                await canvas.enableDeveloperKey(ltiDevId)
                logger.log(`LTI developer key enabled with id ${ltiDevId}`)
                if (updatedJsonTemplate.apiKey && apiDevId) {
                    await canvas.enableDeveloperKey(apiDevId)
                    logger.log(`API developer key enabled with id ${apiDevId}`)
                }
                
                // Add LTI tool to subaccount
                const { externalToolId } = await addOrVerifyLtiToolInSubaccount(canvas, ltiDevId, ltiDevId, canvasAccountId, canvasUrl)
                
                logger.log(`Successfully CREATED tool registration '${ltiRegistrationId}'`)
                emitJsonSummary(jsonOutput, {
                    action: 'created',
                    ltiRegistrationId,
                    toolSupportRegistrationId,
                    developerKeys: {
                        lti: { id: ltiDevId },
                        api: { id: apiDevId || null }
                    },
                    externalTools: {
                        lti: { id: externalToolId }
                    }
                })
            } else {
                // Tool exists - run UPDATE logic
                logger.log(`Tool registration '${ltiRegistrationId}' found. Updating...`)
                
                const ltiToolRegistrationId = existingLtiToolRegistration.id
                logger.log(`LTI registration for ${ltiRegistrationId} found with id ${ltiToolRegistrationId}`)
                
                await embedJwkIfLocalhost(lookupValue('tool_support_url'), jsonTemplate)
                
                // Update LTI developer key
                const canvasLtiKeyExisting = existingLtiToolRegistration.lti.clientId
                logger.log(`Updating the LTI developer key ${canvasLtiKeyExisting}...`)
                await updateDeveloperKey(canvas, 'lti', canvasLtiKeyExisting, jsonTemplate.ltiKey)
                
                let ltiDevId = existingLtiToolRegistration.lti.clientId
                let ltiDevApiKey = existingLtiToolRegistration.lti.clientSecret
                let apiDevId, apiDevApiKey
                let enableApiKey = false
                
                // Handle API key lifecycle (create, update, or delete)
                const apiResult = await handleApiKeyLifecycle(canvas, jsonTemplate, existingLtiToolRegistration)
                apiDevId = apiResult.apiDevId
                apiDevApiKey = apiResult.apiDevApiKey
                enableApiKey = apiResult.enableApiKey
                
                // Update template with key IDs
                let updatedTemplate = replaceKeyIds(processedTemplate, { ltiDevId, ltiDevApiKey, apiDevId, apiDevApiKey })
                let updatedJsonTemplate = JSON.parse(updatedTemplate)
                
                // Update tool registration in tool support
                await toolSupport.updateLtiToolRegistration(ltiToolRegistrationId, updatedJsonTemplate.toolReg)
                logger.log(`LTI registration ${ltiToolRegistrationId} updated successfully`)
                
                // Enable API key if it was just created
                if (enableApiKey && apiDevId) {
                    await canvas.enableDeveloperKey(apiDevId)
                    logger.log(`API developer key enabled with id ${apiDevId}`)
                }
                
                const { externalToolId } = await addOrVerifyLtiToolInSubaccount(canvas, ltiDevId, existingLtiToolRegistration.lti.clientId, canvasAccountId, canvasUrl)
                
                logger.log(`Successfully UPDATED tool registration '${ltiRegistrationId}'`)
                emitJsonSummary(jsonOutput, {
                    action: 'updated',
                    ltiRegistrationId,
                    toolSupportRegistrationId: ltiToolRegistrationId,
                    developerKeys: {
                        lti: { id: ltiDevId },
                        api: { id: apiDevId || null }
                    },
                    externalTools: {
                        lti: { id: externalToolId }
                    }
                })
            }
        } catch (error) {
            if (jsonOutput) {
                console.error(JSON.stringify({ error: error.message }))
            } else {
                console.error(`Deploy failed: ${error.message}`)
            }
            process.exit(1)
        }
    })

program
    .command('validate')
    .description('Checks that the configuration is in tool support and Canvas')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .option('-r, --lti-registration-id <ltiRegistrationId>', 'registration id to use')
    .action(async (options) => {
        updateConfigDirForTemplate(options.template)
        const configUtils = await loadConfig()
        const {setDefaultValues, setOverrides, lookupValue, checkDefined} = configUtils
        
        try {
            let textTemplate = fs.readFileSync(options.template, 'utf8');
            const jsonTemplate = JSON.parse(textTemplate)
            setDefaultValues(jsonTemplate.config)
        } catch (e) {
        }

        setOverrides(options)
        validateConfig(configUtils);
        // Just need this while replacing values, these are the default values.

        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
        const canvasUrl = lookupValue('canvas_url')
        const canvasToken = lookupValue('canvas_token')
        const canvasAccountId = lookupValue('canvas_account_id') || 'self'

        const canvas = canvasCreate(canvasUrl, canvasToken)

        const ltiRegistrationId = checkDefined('lti_registration_id')
        
        const ltiToolRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
        if (!ltiToolRegistration) {
            console.error(`Error: A registration with id '${ltiRegistrationId}' does not exists.`);
            process.exit(1)
        }

        const ltiToolRegistrationId = ltiToolRegistration.id;
        console.log(`LTI registration for ${ltiRegistrationId} found with id ${ltiToolRegistrationId}`);

        const hasLtiKey = ltiToolRegistration.lti !== null;
        const hasProxyKey = ltiToolRegistration.proxy !== null;
        
        const developerKeys = await canvas.getDevKeys();
        let hasError = false
        if (hasLtiKey) {
            const canvasLtiKeyId = ltiToolRegistration.lti.clientId;
            const ltiKey = developerKeys.find(key => key.id === canvasLtiKeyId);
            if (ltiKey) {
                console.log(`Found LTI developer key ${canvasLtiKeyId}`)
                if (canvasAccountId !== 'none') {
                    const ltiTools = await canvas.getLtiTools(canvasAccountId);
                    // For local tools the external tools API uses the shorter ID.
                    const localKeyId = (BigInt(canvasLtiKeyId) % BigInt("10000000000000")).toString()
                    const ltiTool = ltiTools.find(tool => tool.developer_key_id === localKeyId || tool.developer_key_id === canvasLtiKeyId);
                    if (ltiTool) {
                        console.info(`LTI tool ${ltiTool.id} found with developer key ${canvasLtiKeyId} in account ${canvasAccountId}`)
                    } else {
                        console.warn(`Warning: Can't find LTI tool for developer key ${canvasLtiKeyId} in account ${canvasAccountId}`)
                        hasError = true
                    }
                }
            } else {
                console.warn(`Warning: Can't find LTI developer key ${canvasLtiKeyId}`)
                hasError = true
            }
        }

        if (hasProxyKey) {
            const canvasProxyKeyId = ltiToolRegistration.proxy.clientId;
            const proxyKey = developerKeys.find(key => key.id === canvasProxyKeyId);
            if (proxyKey) {
                console.log(`Found API developer key ${canvasProxyKeyId}`)
            } else {
                console.warn(`Warning: Can't find API developer key ${canvasProxyKeyId}`)
                hasError = true
            }
        }
        if (hasError) {
            process.exit(1)
        }
    })

program
    .command('export')
    .description('Export the configuration from the tool support server and Canvas')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .option('-r, --lti-registration-id <ltiRegistrationId>', 'registration id to use')
    .action(async (options) => {
        updateConfigDirForTemplate(options.template)
        const configUtils = await loadConfig()
        const {setOverrides, setDefaultValues, lookupValue, checkDefined} = configUtils
        
        setOverrides(options)
        try {
            let textTemplate = fs.readFileSync(options.template, 'utf8');
            const jsonTemplate = JSON.parse(textTemplate)
            setDefaultValues(jsonTemplate.config)
        } catch (e) {
            // As we just need a registration ID  if there isn't a configuration file it's not a problem
            // as the value may have been passed in on the command line.
        }
        validateConfig(configUtils);

        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
        const canvasUrl = lookupValue('canvas_url')
        const canvasToken = lookupValue('canvas_token')
        const canvas = canvasCreate(canvasUrl, canvasToken)

        const ltiRegistrationId = checkDefined('lti_registration_id') 

        const toolReg = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId);
        if (!toolReg) {
            console.warn(`Warning: Can't find registration: ${ltiRegistrationId}`)
            process.exit(1)
        }

        const hasLtiKey = toolReg.lti !== null;
        const hasProxyKey = toolReg.proxy !== null;
        
        const toolConfig = {
            // We write out the registration ID so it's available when updating
            config: {
                lti_registration_id: ltiRegistrationId
            }
        }
        toolConfig.toolReg = toolReg

        const developerKeys = await canvas.getDevKeys();
        if (hasLtiKey) {
            const canvasLtiKeyId = toolReg.lti.clientId;
            const ltiKey = developerKeys.find(key => key.id === canvasLtiKeyId);
            if (ltiKey) {
                toolConfig.ltiKey = {
                    tool_configuration: {
                        settings: ltiKey.tool_configuration,  
                    },
                    developer_key: {
                        name: ltiKey.name,
                        redirect_uris: ltiKey.redirect_uris,
                        redirect_uri: ltiKey.redirect_uri,
                        notes: ltiKey.notes
                        // The LTI  key has the scopes on the tool_configuration and duplicating them here
                        // causes errors when adding to Canvas.
                    }
                }
            } else {
                console.warn(`Warning: Can't find LTI developer key ${canvasLtiKeyId}`)
            }
        }

        if (hasProxyKey) {
            const canvasProxyKeyId = toolReg.proxy.clientId;
            const apiKey = developerKeys.find(key => key.id === canvasProxyKeyId);
            if (apiKey) {
                toolConfig.apiKey = {
                    developer_key: {
                        name: apiKey.name,
                        require_scopes: apiKey.require_scopes,
                        allow_includes: apiKey.allow_includes,
                        redirect_uris: apiKey.redirect_uris,
                        notes: apiKey.notes,
                        scopes: apiKey.scopes
                    }
                } 
            } else {
                console.warn(`Warning: Can't find API developer key ${canvasProxyKeyId}`)
            }
        }
        
        console.log(JSON.stringify(toolConfig, null, 4))
    })

program
    .command('lookup-lti')
    .description('Lookup the LTI tool in Canvas')
    .option('-t, --template <template>', 'template to use', './tool-config/tool-config.json')
    .option('-r, --lti-registration-id <ltiRegistrationId>', 'registration id to use')
    .action(async (options) => {
        updateConfigDirForTemplate(options.template)
        const configUtils = await loadConfig()
        const {setOverrides, setDefaultValues, lookupValue, checkDefined} = configUtils
        
        setOverrides(options)
        let textTemplate
        try {
            textTemplate = fs.readFileSync(options.template, 'utf8');
            const jsonTemplate = JSON.parse(textTemplate)
            setDefaultValues(jsonTemplate.config)
        } catch (e) {
        }
        validateConfig(configUtils)

        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)

        const canvasUrl = lookupValue('canvas_url')
        const canvasToken = lookupValue('canvas_token')
        const canvasAccountId = lookupValue('canvas_account_id') || 'self'

        const ltiRegistrationId = checkDefined('lti_registration_id')


        const ltiRegistration = await toolSupport.getLtiToolRegistrationByRegistrationId(ltiRegistrationId)
        if (!ltiRegistration) {
            console.error(`Error: A registration with id '${ltiRegistrationId}' does not exists.`)
            process.exit(1)
        }
        const canvasLtiKeyId = ltiRegistration.lti.clientId

        const canvas = canvasCreate(canvasUrl, canvasToken)
        if (canvasAccountId !== 'none') {
            const ltiTools = await canvas.getLtiTools(canvasAccountId)
            // For local tools the external tools API uses the shorter ID.
            const localKeyId = (BigInt(canvasLtiKeyId) % BigInt("10000000000000")).toString()
            const ltiTool = ltiTools.find(tool => tool.developer_key_id === localKeyId || tool.developer_key_id === canvasLtiKeyId);
            if (ltiTool) {
                console.info(JSON.stringify(ltiTool, null, 4))
            } else {
                console.error(`Warning: Can't find LTI tool for developer key ${canvasLtiKeyId} in account ${canvasAccountId}`)
                process.exit(1)
            }
        } else {
            // We need a sub-account to look up the tool in.
            console.error(`No sub-account to lookup the LTI tool in.`)
            process.exit(1)
        }
    })

program
    .command('list')
    .description('List the registrations on the tool support server')
    .action(async () => {
        const configUtils = await loadConfig()
        const {lookupValue} = configUtils
        validateConfig(configUtils);

        const toolSupportUrl = lookupValue('tool_support_url')
        const toolSupportUsername = lookupValue('tool_support_username')
        const toolSupportPassword = lookupValue('tool_support_password')

        const toolSupport = toolSupportCreate(toolSupportUrl, toolSupportUsername, toolSupportPassword)
        const tools = await toolSupport.listLtiToolRegistration();
        tools.map(tool => console.log(tool.lti?.registrationId))
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
