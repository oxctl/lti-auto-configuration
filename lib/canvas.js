import axios from "axios";
import {checkError} from "./http.js";
import parse from "parse-link-header";

// Constant variables to be replaced
const DEV_KEY = '$DEV_KEY';
const ACCOUNT_ID = '$ACCOUNT_ID';

const CANVAS_DELETE_DEV_KEY_API_URL = '/api/v1/developer_keys/';
const CANVAS_CREATE_LTI_KEY_API_URL = '/api/lti/accounts/1/developer_keys/tool_configuration';
const CANVAS_CREATE_API_KEY_API_URL = '/api/v1/accounts/1/developer_keys'
const CANVAS_ENABLE_DEV_KEY_API_URL = `/api/v1/accounts/1/developer_keys/${DEV_KEY}/developer_key_account_bindings`;
const CANVAS_ADD_EXTERNAL_TOOL_API_URL = `/api/v1/accounts/${ACCOUNT_ID}/external_tools`;
const CANVAS_UPDATE_LTI_KEY_API_URL = `/api/lti/developer_keys/${DEV_KEY}/tool_configuration`;
const CANVAS_UPDATE_API_KEY_API_URL = `/api/v1/developer_keys/${DEV_KEY}`;


// One limitation of the Canvas API for developer keys is there's no easy way to retrieve a single developer key
// This means it's not easy to check if a developer key exists.

export default function create(canvasUrl, canvasToken) {
    const REQUEST_CONFIG = {
        headers: {
            Authorization: `Bearer ${canvasToken}`,
            // This is so that we get back IDs as strings as developer key IDs are larger than the maximum supported
            // integer value.
            Accept: 'application/json+canvas-string-ids'
        },
    };

    return {
        getDevKeys: async () => {
            const loadBatch = async (url) => {
                try {
                    const response = await axios.get(url, REQUEST_CONFIG);
                    const link = parse(response.headers.get('link'))
                    let items = []
                    if (link && link.next && link.next.url) {
                        let nextUrl = link.next.url
                        // The link URLs for this API for a time were broken
                        if (!link.next.url.includes('/api/v1/accounts/')) {
                            nextUrl = nextUrl.replace('/accounts/', '/api/v1/accounts/')
                        }
                        items = await loadBatch(nextUrl, response.data)
                    }
                    return [...response.data, ...items]
                } catch (error) {
                    checkError(error)
                    throw new Error(`Error getting developer keys ${error}`);
                }
            }
            return loadBatch(`${canvasUrl}${CANVAS_CREATE_API_KEY_API_URL}`);
        },

        deleteDeveloperKeyById: async (developerKeyId) => {
            // Delete the developer key
            return await axios.delete(`${canvasUrl}${CANVAS_DELETE_DEV_KEY_API_URL}${developerKeyId}`, REQUEST_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    throw new Error(`Error removing developer key ${developerKeyId} by id ${error}`);
                });
        },

        updateLtiDeveloperKey: async (developerKeyId, developerKeyBody) => {
            const updateLtiToolUrl = CANVAS_UPDATE_LTI_KEY_API_URL.replace(DEV_KEY, developerKeyId);

            // Update the developer key
            return await axios.put(`${canvasUrl}${updateLtiToolUrl}`, developerKeyBody, REQUEST_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    throw new Error(`Error updating developer key ${developerKeyId} by id ${error}`);
                });
        },

        updateApiDeveloperKey: async (developerKeyId, developerKeyBody) => {
            const updateApiToolUrl = CANVAS_UPDATE_API_KEY_API_URL.replace(DEV_KEY, developerKeyId);

            // Update the developer key
            return await axios.put(`${canvasUrl}${updateApiToolUrl}`, developerKeyBody, REQUEST_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    throw new Error(`Error updating developer key ${developerKeyId} by id ${error}`);
                });
        },

        // Method to create an LTI developer key
        createLtiDeveloperKey: async (developerKeyBody) => {

            // Create the developer key
            return await axios.post(`${canvasUrl}${CANVAS_CREATE_LTI_KEY_API_URL}`, developerKeyBody, REQUEST_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    throw new Error(`Error creating the LTI developer key ${error}`);
                });
        },

        // Method to create an API developer key
        createApiDeveloperKey: async (developerKeyBody) => {

            // Create the developer key
            return await axios.post(`${canvasUrl}${CANVAS_CREATE_API_KEY_API_URL}`, developerKeyBody, REQUEST_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    throw new Error(`Error creating the API developer key ${error}`);
                });
        },

        // Method to enable a developer key
        enableDeveloperKey: async (developerKeyId) => {

            const enableDevKeyApiUrl = CANVAS_ENABLE_DEV_KEY_API_URL.replace(DEV_KEY, developerKeyId);

            // The request body to enable a Developer Key
            const enableDevKeyBodyObject = {
                developer_key_account_binding: {
                    workflow_state: "on"
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
        },

        getLtiTools: async (canvasAccountId) => {
            const getLtiToolUrl = CANVAS_ADD_EXTERNAL_TOOL_API_URL.replace(ACCOUNT_ID, canvasAccountId);

            const loadBatch = async (url) => {
                try {
                    const response = await axios.get(url, REQUEST_CONFIG);
                    const link = parse(response.headers.get('link'))
                    let items = []
                    if (link && link.next && link.next.url) {
                        let nextUrl = link.next.url
                        items = await loadBatch(nextUrl, response.data)
                    }
                    return [...response.data, ...items]
                } catch (error) {
                    checkError(error)
                    throw new Error(`Error getting LTI tools in sub-account ${canvasAccountId}: ${error}`);
                }
            }
            return loadBatch(`${canvasUrl}${getLtiToolUrl}`);
        },

        // Method to add the created LTI tool to the supplied subaccount.
        addLtiToolToSubaccount: async (developerKeyId, canvasAccountId) => {

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
                    throw new Error(`Error adding the LTI tool ${developerKeyId} to sub-account ${canvasAccountId}: ${error}`);
                });
        }
    }
}