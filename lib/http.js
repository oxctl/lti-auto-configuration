/**
 * Check if we're failing for a reason we can provide more information about.
 */
export const checkError = (error) => {
    const errorCode = error.code || error?.cause?.code
    if (errorCode === 'SELF_SIGNED_CERT_IN_CHAIN') {
        throw new Error('Untrusted certificate in chain')
    }
}

const parseResponseBody = async (response) => {
    const text = await response.text()
    if (!text) {
        return null
    }
    try {
        return JSON.parse(text)
    } catch {
        return text
    }
}

const createHttpError = (response, data) => {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`)
    error.response = {
        status: response.status,
        statusText: response.statusText,
        data,
        headers: response.headers
    }
    return error
}

/**
 * Perform an HTTP request and return an axios-like response object.
 */
export const requestJson = async ({url, method = 'GET', headers = {}, body, basicAuth}) => {
    const requestHeaders = {...headers}

    if (basicAuth) {
        const token = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64')
        requestHeaders.Authorization = `Basic ${token}`
    }

    let requestBody
    if (body !== undefined) {
        requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json'
        requestBody = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody
    })

    const data = await parseResponseBody(response)

    if (!response.ok) {
        throw createHttpError(response, data)
    }

    return {
        data,
        headers: response.headers,
        status: response.status
    }
}
