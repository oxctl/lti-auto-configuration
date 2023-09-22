#! /usr/bin/env node

const { program } = require('commander');
const axios = require('axios');
const JSONBigInt = require('json-bigint');
const fs = require('fs');

// Constant variables to be replaced
const DEV_KEY = 'DEV_KEY';
const LTI_TOOL_TITLE = 'LTI_TOOL_TITLE';
const LTI_SERVER_URL = 'LTI_SERVER_URL';
const PROXY_SERVER_URL = 'PROXY_SERVER_URL';
const LTI_REGISTRATION_ID = 'LTI_REGISTRATION_ID';
const CANVAS_URL = 'CANVAS_URL';
const LTI_DEV_ID = 'LTI_DEV_ID';
const LTI_DEV_KEY = 'LTI_DEV_KEY';
const API_DEV_ID = 'API_DEV_ID';
const API_DEV_KEY = 'API_DEV_KEY';
const ACCOUNT_ID = 'ACCOUNT_ID';

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
  .requiredOption('-c, --command <string>', 'The command, it supports create and delete.')
  .requiredOption('-cs, --canvasserver <string>', 'The Canvas instance URL')
  .requiredOption('-t, --token <string>', 'The Canvas token to perform API requests')
  .requiredOption('-l, --ltiserver <string>', 'The LTI Auth Server URL')
  .requiredOption('-lu, --ltiuser <string>', 'The LTI Auth Server User')
  .requiredOption('-lp, --ltipassword <string>', 'The LTI Auth Server Password')
  .option('-p, --proxyserver <string>', 'The Proxy Server URL')
  .option('-tt, --tooltitle <string>', 'The LTI tool title')
  .option('-tr, --toolregistrationid <string>', 'The tool registration id')
  .option('-a, --accountid <string>', 'The testing account id where the tool will be visible')
  .option('-f, --filetemplate <string>', 'The JSON template containing the LTI, API and tool registration templates. Check the README file for more information.')
  .option('-d, --developerkey <string>', 'The developer key to be deleted')
  ;

program.parse();
const options = program.opts();

const canvasUrl = options.canvasserver;
const canvasToken = options.token;
const canvasAccountId = options.accountid;
const canvasDeveloperKeyToDelete = options.developerkey;

const ltiServerURL = options.ltiserver;
const proxyServerURL = options.proxyserver;
const ltiUser = options.ltiuser;
const ltiPassword = options.ltipassword;
const ltiRegistrationId = options.toolregistrationid;
const ltiToolTitle = options.tooltitle;

const fileTemplate = options.filetemplate;
const command = options.command;

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

const getLtiToolRegistrationByClientId = async (clientId) => {

  // Get the registration id by clientId
  return await axios.get(`${ltiServerURL}${TOOL_SUPPORT_CREATE_API_URL}ltiClientId:${clientId}`, AUTH_CONFIG)
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

  if (!proxyServerURL || !ltiRegistrationId || !ltiToolTitle || !canvasAccountId || !fileTemplate) {
    console.error('The create command requires the Proxy, RegistrationId, toolTitle, filetemplate and AccountId arguments.');
    return;
  }

  (async () => {
    try {

      // Open the template file and replace the variables
      let jsonTemplate = fs.readFileSync(fileTemplate, 'utf8');
      jsonTemplate = jsonTemplate.replaceAll(LTI_TOOL_TITLE, ltiToolTitle);
      jsonTemplate = jsonTemplate.replaceAll(LTI_SERVER_URL, ltiServerURL);
      jsonTemplate = jsonTemplate.replaceAll(PROXY_SERVER_URL, proxyServerURL);
      jsonTemplate = jsonTemplate.replaceAll(LTI_REGISTRATION_ID, ltiRegistrationId);
      jsonTemplate = jsonTemplate.replaceAll(CANVAS_URL, canvasUrl);
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

  if (!canvasDeveloperKeyToDelete) {
    console.error('The delete command requires the Canvas developer key.');
    return;
  }

  (async () => {
    try {

      try {
        // Delete the developer key from Canvas.
        await deleteDeveloperKeyById(canvasDeveloperKeyToDelete);
        console.log(`Developer key ${canvasDeveloperKeyToDelete} deleted successfully.`);
      } catch (error) {
        console.log(error);
      }

      // Search in the LTI auth server for the key to delete it.
      const ltiToolRegistration = await getLtiToolRegistrationByClientId (canvasDeveloperKeyToDelete);
      const ltiToolRegistrationId = ltiToolRegistration.id;
      console.log(`LTI registration found with id ${ltiToolRegistrationId}`);
      const hasProxyKey = ltiToolRegistration.proxy !== null;
      if (hasProxyKey) {
        const canvasApiKeyToDelete = ltiToolRegistration.proxy.clientId;
        console.log(`The LTI developer key ${canvasDeveloperKeyToDelete} has an API key ${canvasApiKeyToDelete}. Deleting it too....`);
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
