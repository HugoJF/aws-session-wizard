# AWS session wizard

```
This is not supposed to be a *public* solution, this is just a quick and dirty tool I wrote (that's why it's not submitted to npm) 
```

### Installation

Install the script globally
```bash
git clone git@github.com:HugoJF/aws-session-wizard.git
cd aws-session-wizard
npm i -g .
```

Add an alias to source variables
```bash
alias aws-session='aws-session-wizard && source ~/.aws/env'
```

### How it works

The `aws-session-wizard` command will prompt you to select a profile and import the MFA code. It will generate `~/.aws/env` and store the session credentials in `~/.aws/session-data/${profile}.session`. 
