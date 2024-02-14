/**
 * Check if we're failing for a reason we can provide more information about.
 */
export const checkError = (error) => {
    if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
        throw new Error('Untrusted certificate in chain')
    }
}

