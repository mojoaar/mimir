export type EmailTemplate = { subject: string; text: string };

function sign(text: string, siteName: string): string {
  return `${text}\n\n- ${siteName}`;
}

export function inviteEmail(input: { siteName: string; link: string; invitedBy: string }): EmailTemplate {
  const { siteName, link, invitedBy } = input;
  return {
    subject: `${invitedBy} invited you to ${siteName}`,
    text: sign(
      `${invitedBy} invited you to ${siteName}, a long-term memory store for your coding agents.\n\nSet your password here:\n${link}\n\nThe link works once and expires in an hour. If you were not expecting this, ignore it.`,
      siteName,
    ),
  };
}

export function resetEmail(input: { siteName: string; link: string }): EmailTemplate {
  const { siteName, link } = input;
  return {
    subject: `Reset your ${siteName} password`,
    text: sign(
      `Someone asked to reset the password for your ${siteName} account.\n\nSet a new one here:\n${link}\n\nThe link works once and expires in an hour. If this was not you, your password has not changed and you can ignore this message.`,
      siteName,
    ),
  };
}

export function emailChangeEmail(input: {
  siteName: string;
  email: string;
  link: string;
}): EmailTemplate {
  const { siteName, email, link } = input;
  return {
    subject: `Confirm your new ${siteName} address`,
    text: sign(
      `You asked to use ${email} for your ${siteName} account.\n\nConfirm it here:\n${link}\n\nThe link works once and expires in an hour. If this was not you, ignore this message: your address has not changed.`,
      siteName,
    ),
  };
}

export function mfaResetEmail(input: { siteName: string; link: string }): EmailTemplate {
  const { siteName, link } = input;
  return {
    subject: `Your ${siteName} second factor was reset`,
    text: sign(
      `An administrator reset the second factor on your ${siteName} account.\n\nYou will be asked to enrol a new authenticator the next time you sign in. To set a new password as well:\n${link}\n\nIf you did not ask for this, contact the administrator of your install.`,
      siteName,
    ),
  };
}

export function backupFailureEmail(input: {
  siteName: string;
  error: string;
  when: Date;
}): EmailTemplate {
  const { siteName, error, when } = input;
  return {
    subject: `${siteName}: backup failed`,
    text: sign(
      `The scheduled backup at ${when.toISOString()} failed.\n\n${error}\n\nNothing was deleted: earlier backups are untouched. Check the backup target credentials and run a backup by hand from Admin → Backups.`,
      siteName,
    ),
  };
}
