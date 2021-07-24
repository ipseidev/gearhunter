const {ClientCredentials} = require('simple-oauth2');

class OAuthClient {
    private token: any;
    private client: any;

    constructor({
                    oauthOptions
                }: any) {
        this.client = new ClientCredentials(oauthOptions);
        this.token = null;
    }

    async getToken() {
        try {
            if (this.token === null || this.token.expired()) {
                this.token = await this.client.getToken()
            }
            return this._reduceToken(this.token);
        } catch (err) {
            console.error(`Failed to retrieve client credentials oauth token: ${err.message}`);
            throw err;
        }
    }

    _reduceToken({token}: any) {
        return token.access_token;
    }
}

module.exports = OAuthClient;
