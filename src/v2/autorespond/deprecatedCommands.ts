import type { Message } from "discord.js";

import { applicationCommands } from "../commands";

const diffCommands = new Map(Object.entries({
  'jquery': 'about jquery',
  'vscode': 'about vscode',
  'modules': 'about modules',
  'flexbox': 'about flexbox',
  'lockfile': 'about lockfile',
  'formatting': 'please format',
  'format': 'please format',
  'code': 'please code'
}))

const regex = new RegExp(`^!(${[...applicationCommands.keys(),...diffCommands.keys()].join('|')})(?: |$)`, 'iu')



export function handleDeprecatedCommands (msg:Message): boolean {
  const match = regex.exec(msg.content)
  if(match) {
    const [,command] = match
    const cmd = command.toLowerCase()

    msg.reply(`It looks like you're attempting to use a command. The web dev bot commands are now using the discord slash commands. Give \`/${diffCommands.get(cmd) ?? cmd}\` a go`)
    return true
  }
  return false
}
