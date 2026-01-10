/**
 * Discord Webhook Utilities
 */

export interface DiscordWebhookMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/**
 * Send a message to Discord webhook
 */
export async function sendDiscordWebhook(
  webhookUrl: string,
  message: DiscordWebhookMessage
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: ${text}`);
  }
}

/**
 * Format Discord mention
 */
export function formatMention(discordId: string, username: string): string {
  return `<@${discordId}> (${username})`;
}

/**
 * Create a simple notification embed
 */
export function createSimpleEmbed(
  title: string,
  description: string,
  color: number = 0x5865F2 // Discord blurple
): DiscordEmbed {
  return {
    title,
    description,
    color,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send Meet-up group donation notification
 */
export async function sendMeetupDonationNotification(
  webhookUrl: string,
  params: {
    meetupTitle: string;
    participants: Array<{
      discord_username: string;
      discord_id: string;
      donated_amount: number;
    }>;
    totalAmount: number;
  }
): Promise<void> {
  const { meetupTitle, participants, totalAmount } = params;

  const participantNames = participants.map(p => p.discord_username).join(', ');
  const participantMentions = participants.map(p => `<@${p.discord_id}>`).join(' ');

  const embed = createSimpleEmbed(
    '🎉 그룹 POW Meet-up 기부 완료!',
    `**${meetupTitle}** 활동에 ${participants.length}명이 총 **${totalAmount} sats**를 기부했습니다!\n\n${participantMentions}`,
    0x00D26A // Green
  );

  embed.fields = [
    {
      name: '참여자',
      value: participantNames,
      inline: false,
    },
    {
      name: '총 기부액',
      value: `${totalAmount} sats`,
      inline: true,
    },
  ];

  await sendDiscordWebhook(webhookUrl, {
    content: '✨ 새로운 그룹 기부가 완료되었습니다!',
    embeds: [embed],
  });
}

/**
 * Send individual donation notification
 */
export async function sendDonationNotification(
  webhookUrl: string,
  params: {
    username: string;
    discordId: string;
    amount: number;
    donationMode: string;
    totalDonated: number;
    note?: string;
  }
): Promise<void> {
  const { username, discordId, amount, donationMode, totalDonated, note } = params;

  const mention = formatMention(discordId, username);
  const noteText = note ? `\n\n💭 "${note}"` : '';

  const description = `${mention}님께서 **${donationMode}**에서 POW 완료 후, **${amount} sats** 기부 완료!${noteText}\n\n누적 기부: ${totalDonated} sats`;

  const embed = createSimpleEmbed(
    '⚡ POW 기부 완료',
    description,
    0xFEE75C // Bitcoin yellow
  );

  await sendDiscordWebhook(webhookUrl, {
    embeds: [embed],
  });
}
