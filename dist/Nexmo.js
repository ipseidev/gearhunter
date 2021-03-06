"use strict";
const Vonage = require('@vonage/server-sdk');
const getItemNameById = require('./utils/getItameName');
const fs = require('fs');
const config = {
    apiKey: process.env.NEXMO_API_KEY,
    apiSecret: process.env.NEXMO_API_SECRET,
};
const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://nimpo:Spotitem09.@cluster0.b0qnw.mongodb.net/spotitem?retryWrites=true&w=majority";
const mongoClient = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
// client.connect((err: any) => {
//     const collection = client.db("spotitem").collection("itemNotified");
//     // perform actions on the collection object
//     client.close();
// });
class Nexmo {
    constructor(nexmoConfig) {
        this.vonage = new Vonage(nexmoConfig, {
            debug: true
        });
        this.mongoClient = mongoClient;
    }
    _buildMessage(server, auction, faction) {
        const nameItem = getItemNameById(auction.item.id);
        const serverName = server.data.realms[0].name.fr_FR;
        const region = server.data.realms[0].category.fr_FR;
        const price = auction.buyout / 10000;
        const variant = auction.item.variant || 0;
        return `
        id : ${auction.id}
        Objet: ${nameItem}
        Serveur : ${serverName} - ${region}
        Faction : ${faction}
        Prix : ${price} golds
        Variant : ${variant}
        `;
    }
    async _isAuctionAlreadyNotified(auctionId) {
        await this.mongoClient.connect();
        return await this.mongoClient.db("spotitem").collection("itemNotified").findOne({ "itemId": auctionId });
    }
    async _setAuctionToNotified(auctionId) {
        if (await this._isAuctionAlreadyNotified(auctionId) !== undefined)
            return;
        await this.mongoClient.db("spotitem").collection("itemNotified").insertOne({ itemId: auctionId });
    }
    async _sendSms(text, auctionId) {
        if (await this._isAuctionAlreadyNotified(auctionId) !== undefined)
            return;
        const from = "GEARHUNTER";
        const to = "33784006727";
        this.vonage.message.sendSms(from, to, text, (err, responseData) => {
            if (err) {
                console.log(err);
            }
            else {
                if (responseData.messages[0]['status'] === "0") {
                    this._setAuctionToNotified(auctionId);
                    console.log("Message sent successfully.");
                }
                else {
                    console.log(`Message failed with error: ${responseData.messages[0]['error-text']}`);
                }
            }
        });
    }
    async _notify(server, auction, faction) {
        const text = await this._buildMessage(server, auction, faction);
        console.log(text);
        this._sendSms(text, auction.id);
    }
}
module.exports = new Nexmo(config);
