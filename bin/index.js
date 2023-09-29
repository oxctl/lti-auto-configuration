#! /usr/bin/env node

const { program } = require('commander');
const axios = require('axios');
const JSONBigInt = require('json-bigint');
const fs = require('fs');

// Constant variables to be replaced
const DEV_KEY = '$DEV_KEY';
const LTI_TOOL_TITLE = '$LTI_TOOL_TITLE';
const LTI_TOOL_URL = '$LTI_TOOL_URL';
const LTI_SERVER_URL = '$LTI_SERVER_URL';
const PROXY_SERVER_URL = '$PROXY_SERVER_URL';
const LTI_REGISTRATION_ID = '$LTI_REGISTRATION_ID';
const CANVAS_URL = '$CANVAS_URL';
const CANVAS_PROVIDER_URL = '$CANVAS_PROVIDER_URL';
const LTI_DEV_ID = '$LTI_DEV_ID';
const LTI_DEV_KEY = '$LTI_DEV_KEY';
const API_DEV_ID = '$API_DEV_ID';
const API_DEV_KEY = '$API_DEV_KEY';
const ACCOUNT_ID = '$ACCOUNT_ID';

// Canvas provider URLs
const CANVAS_TEST_PROVIDER_URL = 'https://sso.test.canvaslms.com';
const CANVAS_BETA_PROVIDER_URL = 'https://sso.beta.canvaslms.com';
const CANVAS_PROD_PROVIDER_URL = 'https://sso.canvaslms.com';

const CANVAS_DELETE_DEV_KEY_API_URL = '/api/v1/developer_keys/';
const CANVAS_CREATE_LTI_KEY_API_URL = '/api/lti/accounts/1/developer_keys/tool_configuration';
const CANVAS_CREATE_API_KEY_API_URL = '/api/v1/accounts/1/developer_keys'
const CANVAS_ENABLE_DEV_KEY_API_URL = `/api/v1/accounts/1/developer_keys/${DEV_KEY}/developer_key_account_bindings`;
const CANVAS_ADD_EXTERNAL_TOOL_API_URL = `/api/v1/accounts/${ACCOUNT_ID}/external_tools`;
const TOOL_SUPPORT_CREATE_API_URL = '/admin/tools/';

// Commands
const CREATE_COMMAND = "CREATE";
const DELETE_COMMAND = "DELETE";

program.name('index.js').description('Contains a set of CLI tools to auto-provision LTI tools to Canvas').version('1.0.0');
program
  .requiredOption('-c, --command <string>', 'The command, create and delete commands are supported.')
  .requiredOption('-t, --templatefile <string>', 'The JSON template with the configuration. Check the README file for more information.')
  .requiredOption('-s, --setupfile <string>', 'The JSON template with the tool setup. Check the README file for more information.')
  .requiredOption('-ss, --secretsfile <string>', 'The JSON template with the secrets. Check the README file for more information.')
  ;

program.parse();
const options = program.opts();
const templateFile = options.templatefile;
const setupFile = options.setupfile;
const secretsFile = options.secretsfile;
const command = options.command;

let jsonTemplate = fs.readFileSync(templateFile, 'utf8');
const config = JSON.parse(jsonTemplate).config;
const setup = JSON.parse(fs.readFileSync(setupFile, 'utf8')).setup;
const secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8')).secrets;

const canvasUrl = setup.canvas_url;
const canvasToken = secrets.canvas_token;
const canvasAccountId = config.lti_account_id;
let canvasProviderUrl = ''
// Set the CanvasProviderUrl based on the CanvasUrl
if (canvasUrl.includes('.test.')) {
  canvasProviderUrl = CANVAS_TEST_PROVIDER_URL;
} else if (canvasUrl.includes('.beta.')) {
  canvasProviderUrl = CANVAS_BETA_PROVIDER_URL;
} else {
  canvasProviderUrl = CANVAS_PROD_PROVIDER_URL;
}

const ltiServerURL = setup.tool_support_url;
const proxyServerURL = setup.proxy_server_url;
const ltiUser = secrets.tool_support_username;
const ltiPassword = secrets.tool_support_password;
const ltiRegistrationId = config.lti_registration_id;
const ltiToolTitle = config.lti_tool_title;
const ltiToolUrl = config.lti_target_link_uri;

// Replace the variables
jsonTemplate = jsonTemplate.replaceAll(LTI_TOOL_TITLE, ltiToolTitle);
jsonTemplate = jsonTemplate.replaceAll(LTI_TOOL_URL, ltiToolUrl);
jsonTemplate = jsonTemplate.replaceAll(LTI_SERVER_URL, ltiServerURL);
jsonTemplate = jsonTemplate.replaceAll(PROXY_SERVER_URL, proxyServerURL);
jsonTemplate = jsonTemplate.replaceAll(LTI_REGISTRATION_ID, ltiRegistrationId);
jsonTemplate = jsonTemplate.replaceAll(CANVAS_URL, canvasUrl);
jsonTemplate = jsonTemplate.replaceAll(CANVAS_PROVIDER_URL, canvasProviderUrl);

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
      throw new Error(`Error creating the LTI developer key ${error}`);
    });

   return null;
}

// Method to create an API developer key
const createApiDeveloperKey = async (developerKeyBody) => {

  // Create the developer key
  return await axios.post(`${canvasUrl}${CANVAS_CREATE_API_KEY_API_URL}`, developerKeyBody, REQUEST_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      throw new Error(`Error creating the API developer key ${error}`);
    });

   return null;
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
    throw new Error(`Error enabling the developer key ${error}`);
  });
  return null;
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
    throw new Error(`Error adding the LTI tool ${developerKeyId} to the testing subaccount ${canvasAccountId} ${error}`);
  });
  return null;
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
      throw new Error(`Error creating the LTI tool registration ${error}`);
    });

   return null;
}

const getLtiToolRegistrationByRegistrationId = async (registrationId) => {

  // Get the registration id by registrationId
  return await axios.get(`${ltiServerURL}${TOOL_SUPPORT_CREATE_API_URL}ltiRegistrationId:${registrationId}`, AUTH_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      throw new Error(`Error getting the LTI tool registration ${error}`);
    });

   return null;

}

const deleteLtiToolRegistration = async (registrationId) => {

  // Get the registration id by clientId
  return await axios.delete(`${ltiServerURL}${TOOL_SUPPORT_CREATE_API_URL}${registrationId}`, AUTH_CONFIG)
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      throw new Error(`Error getting the LTI tool registration ${error}`);
    });

   return null;

}

/****************************************************************************************/
/**************************************Main Function*************************************/
/****************************************************************************************/

if (CREATE_COMMAND !== command.toUpperCase() && DELETE_COMMAND !== command.toUpperCase()) {
  console.error(`Command ${command} is not supported.`);
  return;
}

if (CREATE_COMMAND === command.toUpperCase()) {

  if (!canvasUrl || !canvasToken || !ltiServerURL || !proxyServerURL || !ltiRegistrationId || !ltiToolTitle || !canvasAccountId || !ltiToolUrl) {
    console.error('The create command requires more arguments, please check the config section of your json template file.');
    return;
  }

  (async () => {
    try {

      const parsedJsonTemplate = JSON.parse(jsonTemplate);
      const ltiDeveloperkeyBody = parsedJsonTemplate.ltiKey;
      const apiDeveloperkeyBody = parsedJsonTemplate.apiKey;

      const createdLtiDevKey = await createLtiDeveloperKey(ltiDeveloperkeyBody);
      const ltiDevId = createdLtiDevKey.developer_key.id.toFixed();
      const ltiDevApiKey = createdLtiDevKey.developer_key.api_key;
      console.log(`LTI developer key created with id ${ltiDevId}`);

      const createdApiDevKey = await createApiDeveloperKey(apiDeveloperkeyBody);
      const apiDevId = createdApiDevKey.id.toFixed();
      const apiDevApiKey = createdApiDevKey.api_key;
      console.log(`API developer key created with id ${apiDevId}`);

      // Once we have the developer keys, we have to enable them.
      await enableDeveloperKey(ltiDevId);
      console.log(`LTI developer key enabled with id ${ltiDevId}`);
      await enableDeveloperKey(apiDevId);
      console.log(`API developer key enabled with id ${apiDevId}`);

      // Replace the developer keys
      jsonTemplate = jsonTemplate.replaceAll(LTI_DEV_ID, ltiDevId);
      jsonTemplate = jsonTemplate.replaceAll(LTI_DEV_KEY, ltiDevApiKey);
      jsonTemplate = jsonTemplate.replaceAll(API_DEV_ID, apiDevId);
      jsonTemplate = jsonTemplate.replaceAll(API_DEV_KEY, apiDevApiKey);

      const ltiRegistrationBody = JSON.parse(jsonTemplate).toolReg;
      // Once the developer keys are enabled we can create the registrations in the LTI auth server.
      const ltiToolRegistration = await createLtiToolRegistration(ltiRegistrationBody);
      const ltiToolRegistrationId = ltiToolRegistration.id;
      console.log(`LTI tool registration created with id ${ltiToolRegistrationId}`);

      // Finally we just need to add the LTI tool to the testing subaccount
      const externalTool = await addLtiToolToTestingSubaccount(ltiDevId);
      console.log(`LTI tool with id ${ltiToolRegistrationId} added to the subaccount ${canvasAccountId}. Enjoy your testing.`);

    } catch (error) {
      console.log(error)
    }
  })();

}

if (DELETE_COMMAND === command.toUpperCase()) {

  if (!ltiRegistrationId) {
    console.error('The delete command requires the LTI registration id. See the README file for more information.');
    return;
  }

  (async () => {
    try {

      // Search in the LTI auth server for the key to delete it.
      const ltiToolRegistration = await getLtiToolRegistrationByRegistrationId (ltiRegistrationId);
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
      console.log(error)
    }
  })();

}
