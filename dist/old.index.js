"use strict";
// "use strict";
// require('dotenv').config()
// const axios = require('axios').default;
// const PQueue = require('p-queue');
// const OauthClient = require('./OAuthClient');
// const CONFIG = require('./config');
//
// const oauthOptions = {
//     client: {
//         id: process.env.CLIENT_ID,
//         secret: process.env.CLIENT_SECRET
//     },
//     auth: {
//         tokenHost: process.env.OAUTH_TOKEN_HOST || "https://us.battle.net"
//     }
// };
//
// const oauthClient = new OauthClient({oauthOptions});
// const pqueue = new PQueue.default({concurrency: 2});
//
//
// class Spotitem {
//     private accessToken: string;
//     private oauthClient: any;
//     private listOfConnectedRealmsIds: Array<number> = [];
//     private listOfAuctionHouseIdsByRealmId: Array<string> = [];
//     private listOfUrlsOfAuctionsConnectedRealms: Array<string> = [];
//     private toPromise: Array<Promise> = [];
//
//     constructor(oauthClient: any) {
//         this.oauthClient = oauthClient;
//         this.accessToken = '';
//     }
//
//     async init() {
//         this.accessToken = await this.oauthClient.getToken();
//     }
//
//     async getConnectedRealms() {
//         await this.init();
//         const connectedRealms = await axios.get(`${CONFIG.apiHosts.eu}/data/wow/search/connected-realm?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`);
//         this._reduceConnectedRealms(connectedRealms.data.results);
//     }
//
//     _reduceConnectedRealms(connectedRealms: Array<any>) {
//         for (let realm of connectedRealms) {
//             this.listOfConnectedRealmsIds.push(realm.data.id)
//         }
//     }
//
//     async getUrlsOfAuctionsConnectedRealms() {
//         await this.init();
//         this.listOfConnectedRealmsIds.map(connectedRealmId => {
//             this.listOfUrlsOfAuctionsConnectedRealms.push(`${CONFIG.apiHosts.eu}/data/wow/connected-realm/${connectedRealmId}/auctions/index?namespace=dynamic-classic-eu&status.type=UP&access_token=${this.accessToken}`)
//         })
//     }
//
//     async getAuctionByConnectedRealm(url: string) {
//         return new Promise((resolve, reject) => {
//             axios.get(url).then((response: any) => {
//                 this.listOfAuctionHouseIdsByRealmId.push(response.data);
//                 resolve(response)
//             })
//         })
//     }
//
//     async queueAndExecuteRealmsAuctionsHouseUrls() {
//         this.listOfUrlsOfAuctionsConnectedRealms.forEach((auctionHouseUrl) => {
//             this.toPromise.push(
//                 pqueue.add(async () => {
//                     await this.getAuctionByConnectedRealm(auctionHouseUrl);
//                 })
//             )
//         });
//     }
//
//     async queueAndExecuteAuctionByRealm() {
//         this.listOfAuctionHouseIdsByRealmId.map(auctionsUrl => {
//             console.log(auctionsUrl)
//         })
//     }
//
//
//     async run() {
//         console.log(1);
//         await this.getConnectedRealms();
//         console.log(2);
//         await this.getUrlsOfAuctionsConnectedRealms()
//         console.log(3);
//         await this.queueAndExecuteRealmsAuctionsHouseUrls();
//         await Promise.all(this.toPromise);
//         console.log(4)
//
//         await this.queueAndExecuteAuctionByRealm();
//
//     }
// }
//
//
// const spot = new Spotitem(oauthClient);
// spot.run();
