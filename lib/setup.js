// This file so that we can set values for the config module before importing it.
import path from 'node:path'
import {homedir} from 'node:os'

// This is because we don't expect any config files in some situations (eg running init).
process.env.SUPPRESS_NO_CONFIG_WARNING = 'true'
// Allow NODE_CONFIG_DIR to be overridden, but default to our folders.
process.env.NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR || homedir + '/.tool-config/' + path.delimiter + process.cwd()+ '/tool-config/'

/**
 * Updates NODE_CONFIG_DIR to include the directory of a template file.
 * This allows environment-specific config files (e.g., local-<NODE_ENV>.json) to be found
 * in the same directory as the template when using custom template paths with the -t option.
 * @param {string} templatePath - The path to the template file
 */
export const updateConfigDirForTemplate = (templatePath) => {
    const templateDir = path.dirname(path.resolve(templatePath))
    process.env.NODE_CONFIG_DIR = `${homedir}/.tool-config/${path.delimiter}${templateDir}${path.delimiter}${process.cwd()}/tool-config/`
}