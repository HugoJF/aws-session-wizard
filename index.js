#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');
const prompts = require('prompts');
const PrettyError = require('pretty-error');

const pe = new PrettyError();

// TODO: check session data exists
//

// Regex
const PROFILES_REGEX = /\[(.+)]/g;
const NO_BRACKETS = /\[(.+)]/;
const MFA_SERIAL_REGEX = (profile) => new RegExp(`\\[${profile}\\][a-zA-Z0-9\n\r _=+/]*?aws_mfa_serial ?= ?(.+)`)

// Paths
const credentialsPath = home('.aws/credentials');
const sessionDataPath = profile => home(`.aws/session-data/${profile}.session`);
const envPath = home('.aws/env');

// Credentials
const credentials = fs.readFileSync(credentialsPath).toString();

function home(relative) {
    return path.resolve(process.env.HOME, relative);
}

function getProfiles() {
    return credentials.match(PROFILES_REGEX);
}

function getMfaSerialFromProfile(profile) {
    const serial = credentials.match(MFA_SERIAL_REGEX(profile));

    if (serial.length !== 2) {
        return null;
    }

    return serial[1];
}

async function getSessionToken(profile, mfaSerial, mfaCode) {
    AWS.config.credentials = new AWS.SharedIniFileCredentials({profile});
    // STS must be instantiated AFTER setting credentials
    const STS = new AWS.STS();

    return await STS.getSessionToken({
        TokenCode: mfaCode,
        SerialNumber: mfaSerial,
    }).promise();
}

function removeBrackets(id) {
    return id.match(NO_BRACKETS)[1];
}

async function promptForProfile(profiles) {
    const response = await prompts({
        type: 'select',
        name: 'value',
        message: 'Select a AWS profile',
        choices: profiles.map(match => ({
            title: match,
            value: match,
        })),
    });

    return removeBrackets(response.value);
}

async function promptMfa() {
    const response = await prompts({
        type: 'password',
        name: 'value',
        message: 'MFA Code',
    });

    return response.value;
}

function storeCredentialsToFile(profile, credentials) {
    fs.writeFileSync(sessionDataPath(profile), JSON.stringify(credentials));
}

function loadSessionFromFile(profile) {
    try {
        const raw = fs.readFileSync(sessionDataPath(profile));

        return JSON.parse(raw.toString());
    } catch (e) {
        return undefined;
    }
}

function sessionToEnv(credentials) {
    const env = {
        AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
        AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
        AWS_SESSION_TOKEN: credentials.SessionToken,
    }

    const data = Object.entries(env).map(entry => entry.join('=')).map(entry => `export ${entry}`).join('\n');

    fs.writeFileSync(envPath, data)
}

function isSessionExpired(credentials) {
    const expiration = new Date(credentials.Expiration);
    const now = new Date;

    return expiration < now;
}

async function start() {
    const profiles = getProfiles();
    const session = loadSessionFromFile();
    const profile = await promptForProfile(profiles);

    if (!session || isSessionExpired(session)) {
        console.log('Credentials have expired, renewing...');

        const mfaSerial = getMfaSerialFromProfile(profile);
        if (!mfaSerial) {
            throw new Error(`Could not find MFA serial for profile ${profile}`);
        }
        const mfaCode = await promptMfa();
        const session = await getSessionToken(profile, mfaSerial, mfaCode);

        storeCredentialsToFile(profile, session.Credentials);
    }

    sessionToEnv(loadSessionFromFile(profile));
    console.log(`Updated credentials file for profile and set env to ${profile}!`);
}

start().catch(e => {
    console.log();
    console.log(pe.render(e));
    process.exit(1);
})
