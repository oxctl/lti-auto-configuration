#! /usr/bin/env node

const { program } = require('commander');
const axios = require('axios');
const JSONBigInt = require('json-bigint');
const fs = require('fs');

const [major, minor, patch] = process.versions.node.split('.').map(Number)
if (major < 15) {
  console.error(`Requires Node 15 (or higher, ${major} found)`);
  process.exit(1)
}

// Release version, please BUMP this every new release.
const RELEASE_VERSION = '1.1.12';

// Constant variables to be replaced
const DEV_KEY = '$DEV_KEY';
// Generally this shouldn't be used and $TITLE_SUFFIX should be used instead.
const LTI_TOOL_TITLE = '$LTI_TOOL_TITLE';
// Using the suffix allows more content to be in the templates
const TITLE_SUFFIX = '$TITLE_SUFFIX'
const LTI_TOOL_URL = '$LTI_TOOL_URL';
const LTI_SERVER_URL = '$LTI_SERVER_URL';
const PROXY_SERVER_URL = '$PROXY_SERVER_URL';
const LTI_REGISTRATION_ID = '$LTI_REGISTRATION_ID';
const CANVAS_URL = '$CANVAS_URL';
const CANVAS_PROVIDER_URL = '$CANVAS_PROVIDER_URL';
const CANVAS_ISSUER_URI = '$CANVAS_ISSUER_URI';
const LTI_DEV_ID = '$LTI_DEV_ID';
const LTI_DEV_KEY = '$LTI_DEV_KEY';
const API_DEV_ID = '$API_DEV_ID';
const API_DEV_KEY = '$API_DEV_KEY';
const ACCOUNT_ID = '$ACCOUNT_ID';
const PROXY_SECRET = '$PROXY_SECRET';
const README_RECOMMENDATION = 'Please check the README file for more information.';

// Canvas provider URLs
const CANVAS_TEST_PROVIDER_URL = 'https://sso.test.canvaslms.com';
const CANVAS_BETA_PROVIDER_URL = 'https://sso.beta.canvaslms.com';
const CANVAS_PROD_PROVIDER_URL = 'https://sso.canvaslms.com';

// Canvas issuer URIs
const CANVAS_TEST_ISSUER_URI = 'https://canvas.test.instructure.com';
const CANVAS_BETA_ISSUER_URI = 'https://canvas.beta.instructure.com';
const CANVAS_PROD_ISSUER_URI = 'https://canvas.instructure.com';

const CANVAS_DELETE_DEV_KEY_API_URL = '/api/v1/developer_keys/';
const CANVAS_CREATE_LTI_KEY_API_URL = '/api/lti/accounts/1/developer_keys/tool_configuration';
const CANVAS_CREATE_API_KEY_API_URL = '/api/v1/accounts/1/developer_keys'
const CANVAS_ENABLE_DEV_KEY_API_URL = `/api/v1/accounts/1/developer_keys/${DEV_KEY}/developer_key_account_bindings`;
const CANVAS_ADD_EXTERNAL_TOOL_API_URL = `/api/v1/accounts/${ACCOUNT_ID}/external_tools`;
const TOOL_SUPPORT_CREATE_API_URL = '/admin/tools/';

program.name('index.js').description('Contains a set of CLI tools to auto-provision LTI tools to Canvas').version(RELEASE_VERSION);
program
  .option('-c, --create', 'Use this option to create a developer key.')
  .option('-d, --delete', 'Use this option to delete a developer key.')
  .option('-X [string...]', 'Override values present in the config section of the templates. Example: -X "lti_tool_title=Tool Title Provided By Command Line" -X "lti_registration_id=custom-reg-id".')
  .requiredOption('-t, --templatefile <string>', `The JSON template with the configuration. ${README_RECOMMENDATION}`)
  .requiredOption('-s, --setupfile <string>', `The JSON template with the tool setup. ${README_RECOMMENDATION}`)
  .requiredOption('-ss, --secretsfile <string>', `The JSON template with the secrets. ${README_RECOMMENDATION}`)
  ;

program.parse();
const options = program.opts();
const isCreateCommand = options.create;
const isDeleteCommand = options.delete;
const overridenProperties = options.X;

if (!isCreateCommand && !isDeleteCommand) {
  console.log(`No command flag has been provided. ${README_RECOMMENDATION}`);
  process.exit(1);
}

if (isCreateCommand && isDeleteCommand) {
  console.log(`Please enter only one command at a time. ${README_RECOMMENDATION}`);
  process.exit(1);
}

const templateFile = options.templatefile;
const setupFile = options.setupfile;
const secretsFile = options.secretsfile;
const command = options.command;

let jsonTemplate = fs.readFileSync(templateFile, 'utf8');
const config = JSON.parse(jsonTemplate).config;
const setup = JSON.parse(fs.readFileSync(setupFile, 'utf8')).setup;
const secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8')).secrets;

let canvasUrl = setup.canvas_url;
let canvasToken = secrets.canvas_token;
let canvasAccountId = config.lti_account_id;

let ltiServerURL = setup.tool_support_url;
let proxyServerURL = setup.proxy_server_url;
let proxySecret = secrets.proxy_secret;
let ltiUser = secrets.tool_support_username;
let ltiPassword = secrets.tool_support_password;
let ltiRegistrationId = config.lti_registration_id;
let ltiToolTitle = config.lti_tool_title || '';
let titleSuffix = config.title_suffix || '';
let ltiToolUrl = config.lti_tool_url;

// Properties overridden by command arguments.
if (overridenProperties) {
  overridenProperties.forEach(overriddenProperty => {
    const property = overriddenProperty.split('=')[0];
    const value = overriddenProperty.split('=')[1];
    console.log(`The property '${property}' has been overridden from the CLI.`);
    switch (property) {
      case 'lti_tool_title':
        ltiToolTitle = value;
        break;
      case 'title_suffix':
        titleSuffix = value;
        break;
      case 'lti_registration_id':
        ltiRegistrationId = value;
        break;
      case 'lti_tool_url':
        ltiToolUrl = value;
        break;
      case 'lti_account_id':
        canvasAccountId = value;
        break;
      case 'canvas_url':
        canvasUrl = value;
        break;
      case 'canvas_token':
        canvasToken = value;
        break;
      case 'tool_support_url':
        ltiServerURL = value;
        break;
      case 'tool_support_username':
        ltiUser = value;
        break;
      case 'tool_support_password':
        ltiPassword = value;
        break;
      case 'proxy_server_url':
        proxyServerURL = value;
        break;
      case 'proxy_secret':
        proxySecret = value;
        break;
      default:
        console.log(`Overriden '${property}' option not supported. ${README_RECOMMENDATION}`);
    }
  })
}

let canvasProviderUrl = '';
let canvasIssuerUri = '';
// Set the CanvasProviderUrl based on the CanvasUrl
if (canvasUrl.includes('.test.')) {
  canvasProviderUrl = CANVAS_TEST_PROVIDER_URL;
  canvasIssuerUri = CANVAS_TEST_ISSUER_URI;
} else if (canvasUrl.includes('.beta.')) {
  canvasProviderUrl = CANVAS_BETA_PROVIDER_URL;
  canvasIssuerUri = CANVAS_BETA_ISSUER_URI;
} else {
  canvasProviderUrl = CANVAS_PROD_PROVIDER_URL;
  canvasIssuerUri = CANVAS_PROD_ISSUER_URI;
}


// Replace the variables
jsonTemplate = jsonTemplate.replaceAll(LTI_TOOL_TITLE, ltiToolTitle);
jsonTemplate = jsonTemplate.replaceAll(TITLE_SUFFIX, titleSuffix);
jsonTemplate = jsonTemplate.replaceAll(LTI_TOOL_URL, ltiToolUrl);
jsonTemplate = jsonTemplate.replaceAll(LTI_SERVER_URL, ltiServerURL);
jsonTemplate = jsonTemplate.replaceAll(PROXY_SERVER_URL, proxyServerURL);
jsonTemplate = jsonTemplate.replaceAll(LTI_REGISTRATION_ID, ltiRegistrationId);
jsonTemplate = jsonTemplate.replaceAll(CANVAS_URL, canvasUrl);
jsonTemplate = jsonTemplate.replaceAll(CANVAS_PROVIDER_URL, canvasProviderUrl);
jsonTemplate = jsonTemplate.replaceAll(CANVAS_ISSUER_URI, canvasIssuerUri);
jsonTemplate = jsonTemplate.replaceAll(PROXY_SECRET, proxySecret);


/**
 * Check if we're failing for a reason we can provide more information about.
 */
const checkError = (error) => {
  if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    throw new Error('Untrusted certificate in chain')
  }
}

/**
 * Check if tool support request is failing for a reason we know more about.
 */
const checkToolSupportError = (error) => {
  if (error.response && error.response.status === 409) {
      throw new Error('Conflict, check registrationIds (lti/proxy) are unique')
  }
}
  
/****************************************************************************************/
/**************************************Canvas********************************************/
/****************************************************************************************/

const REQUEST_CONFIG = {
  headers: { Authorization: `Bearer ${canvasToken}` },
  // IMPORTANT: The developer key ids are greater than the maximum safe integer, we have to use bigints.
  // https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
  transformResponse: [data => JSONBigInt.parse(data)]
};

const getDevKeys = async () => {
  // Create the developer key
  return await axios.get(`${canvasUrl}${CANVAS_CREATE_API_KEY_API_URL}`, REQUEST_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      checkError(error)
      throw new Error(`Error getting developer keys ${error}`);
    });
}

const deleteDeveloperKeyById = async (developerKeyId) => {
  // Delete the developer key
  return await axios.delete(`${canvasUrl}${CANVAS_DELETE_DEV_KEY_API_URL}${developerKeyId}`, REQUEST_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      checkError(error)
      throw new Error(`Error removing developer key ${developerKeyId} by id ${error}`);
    });
}

// Method to create an LTI developer key
const createLtiDeveloperKey = async (developerKeyBody) => {

  // Create the developer key
  return await axios.post(`${canvasUrl}${CANVAS_CREATE_LTI_KEY_API_URL}`, developerKeyBody, REQUEST_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      checkError(error)
      throw new Error(`Error creating the LTI developer key ${error}`);
    });
}

// Method to create an API developer key
const createApiDeveloperKey = async (developerKeyBody) => {

  // Create the developer key
  return await axios.post(`${canvasUrl}${CANVAS_CREATE_API_KEY_API_URL}`, developerKeyBody, REQUEST_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      checkError(error)
      throw new Error(`Error creating the API developer key ${error}`);
    });
}

// Method to enable a developer key
const enableDeveloperKey = async (developerKeyId) => {

  const enableDevKeyApiUrl = CANVAS_ENABLE_DEV_KEY_API_URL.replace(DEV_KEY, developerKeyId);

  // The request body to enable a Developer Key
  const enableDevKeyBodyObject = {
    developer_key_account_binding: {
      workflow_state:"on"
    }
  };

  // Enable the developer key
  return await axios.post(`${canvasUrl}${enableDevKeyApiUrl}`, enableDevKeyBodyObject, REQUEST_CONFIG)
  .then(function (response) {
    return response.data;
  })
  .catch(function (error) {
    checkError(error)
    throw new Error(`Error enabling the developer key ${error}`);
  });
}

// Method to add the created LTI tool to the testing subaccount.
const addLtiToolToTestingSubaccount = async (developerKeyId) => {

  const addLtiToolUrl = CANVAS_ADD_EXTERNAL_TOOL_API_URL.replace(ACCOUNT_ID, canvasAccountId);

  // The request body to enable a Developer Key
  const enableDevKeyBodyObject = {
    client_id: developerKeyId
  };

  // Add the external tool to the testing subaccount
  return await axios.post(`${canvasUrl}${addLtiToolUrl}`, enableDevKeyBodyObject, REQUEST_CONFIG)
  .then(function (response) {
    return response.data;
  })
  .catch(function (error) {
    checkError(error)
    throw new Error(`Error adding the LTI tool ${developerKeyId} to the testing subaccount ${canvasAccountId} ${error}`);
  });
}

/****************************************************************************************/
/**************************************tool-support**************************************/
/****************************************************************************************/
const AUTH_CONFIG = {
  auth: {
    username: ltiUser,
    password: ltiPassword
  }
}

// Method to create an LTI tool registration in tool-support
const createLtiToolRegistration = async (ltiRegistrationBody) => {

  // Create the tool registration
  return await axios.post(`${ltiServerURL}${TOOL_SUPPORT_CREATE_API_URL}`, ltiRegistrationBody, AUTH_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      checkError(error)
      checkToolSupportError(error)
      throw new Error(`Error creating the LTI tool registration ${error}`);
    });
}

const getLtiToolRegistrationByRegistrationId = async (registrationId) => {

  // Get the registration id by registrationId
  return await axios.get(`${ltiServerURL}${TOOL_SUPPORT_CREATE_API_URL}ltiRegistrationId:${registrationId}`, AUTH_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      checkError(error)
      checkToolSupportError(error)
      if (!error.response || error.response.status !== 404) {
        throw new Error(`Error getting the LTI tool ${error}`);
      }
        
      return null;
    });
}

const deleteLtiToolRegistration = async (registrationId) => {

  // Get the registration id by clientId
  return await axios.delete(`${ltiServerURL}${TOOL_SUPPORT_CREATE_API_URL}${registrationId}`, AUTH_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      checkError(error)
      checkToolSupportError(error)
      throw new Error(`Error getting the LTI tool registration ${error}`);
    });

}

const retrieveJwk = async (jwkUrl) => {
  return await axios.get(jwkUrl)
      .then(response => response.data)
      .catch(error => {
        throw new Error(`Error loading ${jwkUrl} of: ${error}`)
      })
}

/****************************************************************************************/
/**************************************Main Function*************************************/
/****************************************************************************************/


if (isCreateCommand) {

  if (!canvasUrl || !canvasToken || !ltiServerURL || !proxyServerURL || !ltiRegistrationId || !canvasAccountId || !ltiToolUrl) {
    console.error('The create command requires more arguments, please check the config section of your json template file.');
    process.exit(1);
  }

  (async () => {
    try {
      
      // Search in tool-support for an existing registration id, otherwise we end up creating multiple keys in Canvas
      const existingLtiToolRegistration = await getLtiToolRegistrationByRegistrationId (ltiRegistrationId);
      if (existingLtiToolRegistration) {
        throw new Error(`A registration with id '${ltiRegistrationId}' already exists, not creating any key.`);
      }
      
      const parsedJsonTemplate = JSON.parse(jsonTemplate);
      const ltiDeveloperkeyBody = parsedJsonTemplate.ltiKey;
      const apiDeveloperkeyBody = parsedJsonTemplate.apiKey;

      // Automatically inline JWK when on localhost this is because unless Canvas is also running locally it won't
      // be able to contact the JWK endpoint to download the keys.
      // This isn't a perfect regex as many more things can be on localhost, but it's a reasonable guess
      // In the future this should be controlled (overwritten) by a command line flag
      if (/(localhost)|(127.0.0.1)/.test(ltiServerURL)) {
        const jwkUrl = ltiDeveloperkeyBody.tool_configuration.settings.public_jwk_url
        if (jwkUrl) {
          const jwks = await retrieveJwk(jwkUrl);
          const publicJwk = jwks.keys[0];
          delete ltiDeveloperkeyBody.tool_configuration.settings.public_jwk_url;
          ltiDeveloperkeyBody.tool_configuration.settings.public_jwk = publicJwk;
          console.log(`Embedded key from ${jwkUrl} in LTI developer key`);
        }
      }

      const createdLtiDevKey = await createLtiDeveloperKey(ltiDeveloperkeyBody);
      const ltiDevId = createdLtiDevKey.developer_key.id.toFixed();
      const ltiDevApiKey = createdLtiDevKey.developer_key.api_key;
      console.log(`LTI developer key created with id ${ltiDevId}`);

      // Replace the developer keys
      jsonTemplate = jsonTemplate.replaceAll(LTI_DEV_ID, ltiDevId);
      jsonTemplate = jsonTemplate.replaceAll(LTI_DEV_KEY, ltiDevApiKey);

      let ltiRegistrationBody = JSON.parse(jsonTemplate).toolReg;
      let apiDevId = null
      if (apiDeveloperkeyBody) {
        // Check if tool-support is configured to use a proxy.
        if (ltiRegistrationBody.proxy) {
          const createdApiDevKey = await createApiDeveloperKey(apiDeveloperkeyBody);
          apiDevId = createdApiDevKey.id.toFixed();
          const apiDevApiKey = createdApiDevKey.api_key;
          // Replace the developer keys
          jsonTemplate = jsonTemplate.replaceAll(API_DEV_ID, apiDevId);
          jsonTemplate = jsonTemplate.replaceAll(API_DEV_KEY, apiDevApiKey);
          console.log(`API developer key created with id ${apiDevId}`);
          // Update the body
          ltiRegistrationBody = JSON.parse(jsonTemplate).toolReg;
        } else {
          // If we don't skip on creation then we end up leaving it on deletion.
          console.warn(`No API key in tool support registration`)
        }
      }


      // Once the developer keys are enabled we can create the registrations in the LTI auth server.
      const ltiToolRegistration = await createLtiToolRegistration(ltiRegistrationBody);
      const ltiToolRegistrationId = ltiToolRegistration.id;
      console.log(`LTI tool registration created with id ${ltiToolRegistrationId}`);

      // Once we have the developer keys, we have to enable them.
      await enableDeveloperKey(ltiDevId);
      console.log(`LTI developer key enabled with id ${ltiDevId}`);
      if (apiDeveloperkeyBody && apiDevId) {
        await enableDeveloperKey(apiDevId);
        console.log(`API developer key enabled with id ${apiDevId}`);
      }

      // Finally we just need to add the LTI tool to the testing subaccount
      const externalTool = await addLtiToolToTestingSubaccount(ltiDevId);
      console.log(`LTI tool with id ${ltiToolRegistrationId} added to the subaccount ${canvasAccountId}. Enjoy your testing.`);

    } catch (error) {
      console.log(error);
      process.exit(1);
    }
  })();

}

if (isDeleteCommand) {

  if (!ltiRegistrationId) {
    console.error(`The delete command requires the LTI registration id. ${README_RECOMMENDATION}`);
    process.exit(1);
  }

  (async () => {
    try {

      // Search in the LTI auth server for the key to delete it.
      const ltiToolRegistration = await getLtiToolRegistrationByRegistrationId (ltiRegistrationId);
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
          await deleteDeveloperKeyById(canvasLtiKeyToDelete);
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
          await deleteDeveloperKeyById(canvasApiKeyToDelete);
          console.log(`Developer key ${canvasApiKeyToDelete} deleted successfully.`);
        } catch (error) {
          console.log(error);
        }
      }

      // Now delete the LTI tool registration.
      await deleteLtiToolRegistration(ltiToolRegistrationId);
      console.log(`LTI registration ${ltiToolRegistrationId} deleted successfully.`);

    } catch (error) {
      console.log(error);
      process.exit(1);
    }
  })();

}
