import axios from "axios";
import {checkError} from "./http.js";

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
            return await axios.post(`${ltiServerURL}${ADMIN_PATH}`, ltiRegistrationBody, AUTH_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    checkToolSupportError(error)
                    throw new Error(`Error creating the LTI tool registration ${error}`);
                });
        },

        getLtiToolRegistrationByRegistrationId: async (registrationId) => {

            // Get the registration id by registrationId
            return await axios.get(`${ltiServerURL}${ADMIN_PATH}ltiRegistrationId:${registrationId}`, AUTH_CONFIG)
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
        },
        
        updateLtiToolRegistration: async (registrationId, ltiRegistrationBody) => {

            // Create the tool registration
            return await axios.put(`${ltiServerURL}${ADMIN_PATH}${registrationId}`, ltiRegistrationBody, AUTH_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    checkToolSupportError(error)
                    throw new Error(`Error creating the LTI tool registration ${error}`);
                });
        },

        deleteLtiToolRegistration: async (registrationId) => {

            // Get the registration id by clientId
            return await axios.delete(`${ltiServerURL}${ADMIN_PATH}${registrationId}`, AUTH_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    checkToolSupportError(error)
                    throw new Error(`Error getting the LTI tool registration ${error}`);
                });

        },

        listLtiToolRegistration: async () => {
            // List all the registrations
            return await axios.get(`${ltiServerURL}${ADMIN_PATH}`, AUTH_CONFIG)
                .then(function (response) {
                    return response.data;
                })
                .catch(function (error) {
                    checkError(error)
                    checkToolSupportError(error)
                    throw new Error(`Error getting the LTI tool registration ${error}`);
                });

        }
        
        
    }


}