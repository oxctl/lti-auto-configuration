// This file so that we can set values for the config module before importing it.
import path from 'node:path'
import {homedir} from 'node:os'

// This is because we don't expect any config files in some situations (eg running init).
process.env.SUPPRESS_NO_CONFIG_WARNING = 'true'
// Allow NODE_CONFIG_DIR to be overridden, but default to our folders.
process.env.NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR || homedir + '/.tool-config/' + path.delimiter + process.cwd()+ '/tool-config/'