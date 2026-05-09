const { Client, GatewayIntentBits, AttachmentBuilder, ActivityType } = require("discord.js");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const userCooldowns = new Map();
let cachedFile = null;
let cachedFileName = null;

function loadLineFile() {
  const fileName = String(config.LINE_FILE_NAME || "line.png");
  const filePath = path.join(__dirname, fileName);

  if (!fs.existsSync(filePath)) {
    console.log(`[warn] "${fileName}" not found, autoline wont work`);
    return;
  }

  cachedFile = fs.readFileSync(filePath);
  cachedFileName = fileName;
  console.log(`loaded "${fileName}"`);
}

client.once("clientReady", (readyClient) => {
  console.log(`logged in as ${readyClient.user.username}`);
  loadLineFile();
  setStatus(readyClient);
});

function setStatus(readyClient) {
  if (config.CREDITS_STATUS) {
    readyClient.user.setPresence({
      activities: [
        {
          name: "sirsnaryo.xyz/#projects",
          type: ActivityType.Playing
        }
      ],
      status: "online"
    });
    return;
  }

  if (config.BOT_STATUS_ENABLED) {
    const types = {
      PLAYING: ActivityType.Playing,
      WATCHING: ActivityType.Watching,
      LISTENING: ActivityType.Listening,
      COMPETING: ActivityType.Competing
    };

    readyClient.user.setPresence({
      activities: [
        {
          name: String(config.BOT_STATUS_TEXT || "-"),
          type: types[String(config.BOT_STATUS_TYPE || "PLAYING").toUpperCase()] || ActivityType.Playing
        }
      ],
      status: "online"
    });
  }
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item));
}

function hasUnquotedIds(value) {
  return Array.isArray(value) && value.some(item => typeof item === "number");
}

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    if (typeof config.GUILD_ID === "number") {
      console.log(`GUILD_ID needs quotes in config.yml, skipping`);
      return;
    }

    if (config.GUILD_ID && config.GUILD_ID !== "-" && message.guild.id !== String(config.GUILD_ID)) {
      return;
    }

    if (hasUnquotedIds(config.AUTO_LINE_CHANNEL_IDS)) {
      console.log(`channel IDs need quotes in config.yml`);
      return;
    }

    if (hasUnquotedIds(config.AUTO_LINE_WHITELISTED_USERS)) {
      console.log(`user IDs need quotes in config.yml`);
      return;
    }

    if (config.AUTO_LINE_WHITELIST_ENABLED) {
      const whitelist = toStringArray(config.AUTO_LINE_WHITELISTED_USERS);
      if (!whitelist.includes(message.author.id)) {
        return;
      }
    }

    const channelIds = toStringArray(config.AUTO_LINE_CHANNEL_IDS);
    const words = Array.isArray(config.AUTO_LINE_WORDS)
      ? config.AUTO_LINE_WORDS.map(w => String(w))
      : [];

    let byChannel = false;
    let byWord = false;
    let matchedWord = null;

    if (config.AUTO_LINE_CHANNELS_ENABLED) {
      byChannel = channelIds.includes(message.channel.id);
    }

    if (config.AUTO_LINE_WORDS_ENABLED) {
      const content = String(message.content || "").toLowerCase();
      matchedWord = words.find(w => content.includes(w.toLowerCase())) || null;
      byWord = Boolean(matchedWord);
    }

    if (config.AUTO_LINE_CHANNELS_ENABLED && config.AUTO_LINE_WORDS_ENABLED) {
      if (!byChannel && !byWord) return;
    } else if (config.AUTO_LINE_CHANNELS_ENABLED) {
      if (!byChannel) return;
    } else if (config.AUTO_LINE_WORDS_ENABLED) {
      if (!byWord) return;
    }

    let reason = "AutoLine";
    if (byChannel && byWord) {
      reason = `AutoLine Channel & Word "${matchedWord}"`;
    } else if (byChannel) {
      reason = "AutoLine Channel";
    } else if (byWord) {
      reason = `AutoLine Word "${matchedWord}"`;
    } else if (!config.AUTO_LINE_CHANNELS_ENABLED && !config.AUTO_LINE_WORDS_ENABLED) {
      reason = "AutoLine All Messages";
    }

    const cooldown = Number(config.AUTO_LINE_COOLDOWN || 0);
    if (cooldown > 0) {
      const last = userCooldowns.get(message.author.id) || 0;
      const diff = (Date.now() - last) / 1000;
      if (diff < cooldown) {
        console.log(`${message.author.username} is on cooldown, ${Math.ceil(cooldown - diff)}s left`);
        return;
      }
    }

    if (!cachedFile) {
      console.log(`line file isnt cached, does "${config.LINE_FILE_NAME}" exist?`);
      return;
    }

    if (config.DELETE_USER_MESSAGE) {
      try {
        await message.delete();
      } catch {
        console.log(`couldnt delete message, missing perms?`);
        return;
      }
    }

    const attachment = new AttachmentBuilder(cachedFile, {
      name: cachedFileName
    });

    if (config.AUTO_LINE_REPLY_TO_MESSAGE && !config.DELETE_USER_MESSAGE) {
      await message.reply({ files: [attachment] });
    } else {
      await message.channel.send({ files: [attachment] });
    }

    if (cooldown > 0) {
      userCooldowns.set(message.author.id, Date.now());
    }

    console.log(`sent line in #${message.channel.name} (${reason})`);
  } catch (err) {
    console.log(`something broke: ${err.message}`);
  }
});

client.login(config.TOKEN);
