import {checkError, requestJson} from "./http.js";

const ADMIN_PATH = '/admin/tools/';
export default function create(ltiServerURL, ltiUser, ltiPassword) {
    // Method to create an LTI tool registration in tool-support
    const AUTH_CONFIG = {
        auth: {
            username: ltiUser,
            password: ltiPassword
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
    
    return {
        createLtiToolRegistration: async (ltiRegistrationBody) => {

            // Create the tool registration
            try {
                const response = await requestJson({
                    url: `${ltiServerURL}${ADMIN_PATH}`,
                    method: 'POST',
                    body: ltiRegistrationBody,
                    basicAuth: AUTH_CONFIG.auth
                })
                return response.data
            } catch (error) {
                checkError(error)
                checkToolSupportError(error)
                throw new Error(`Error creating the LTI tool registration ${error}`);
            }
        },

        getLtiToolRegistrationByRegistrationId: async (registrationId) => {

            // Get the registration id by registrationId
            try {
                const response = await requestJson({
                    url: `${ltiServerURL}${ADMIN_PATH}ltiRegistrationId:${registrationId}`,
                    method: 'GET',
                    basicAuth: AUTH_CONFIG.auth
                })
                return response.data
            } catch (error) {
                checkError(error)
                checkToolSupportError(error)
                if (!error.response || error.response.status !== 404) {
                    throw new Error(`Error getting the LTI tool ${error}`);
                }

                return null;
            }
        },
        
        updateLtiToolRegistration: async (registrationId, ltiRegistrationBody) => {

            // Update the tool registration
            try {
                const response = await requestJson({
                    url: `${ltiServerURL}${ADMIN_PATH}${registrationId}`,
                    method: 'PUT',
                    body: ltiRegistrationBody,
                    basicAuth: AUTH_CONFIG.auth
                })
                return response.data
            } catch (error) {
                checkError(error)
                checkToolSupportError(error)
                throw new Error(`Error updating the LTI tool registration ${error}`);
            }
        },

        deleteLtiToolRegistration: async (registrationId) => {

            // Get the registration id by clientId
            try {
                const response = await requestJson({
                    url: `${ltiServerURL}${ADMIN_PATH}${registrationId}`,
                    method: 'DELETE',
                    basicAuth: AUTH_CONFIG.auth
                })
                return response.data
            } catch (error) {
                checkError(error)
                checkToolSupportError(error)
                throw new Error(`Error deleting the LTI tool registration ${error}`);
            }

        },

        listLtiToolRegistration: async () => {
            // List all the registrations
            try {
                const response = await requestJson({
                    url: `${ltiServerURL}${ADMIN_PATH}`,
                    method: 'GET',
                    basicAuth: AUTH_CONFIG.auth
                })
                return response.data
            } catch (error) {
                checkError(error)
                checkToolSupportError(error)
                throw new Error(`Error getting the LTI tool registration ${error}`);
            }

        }
        
        
    }


}
