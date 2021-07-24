"use strict";
const Vonage = require('@vonage/server-sdk');
const getItemNameById = require('./enums/itemsEnum');
const fs = require('fs');
const config = {
    apiKey: process.env.NEXMO_API_KEY,
    apiSecret: process.env.NEXMO_API_SECRET,
};
class Nexmo {
    constructor(nexmoConfig) {
        this.vonage = new Vonage(nexmoConfig, {
            debug: true
        });
    }
    _buildMessage(server, auction, faction) {
        const nameItem = getItemNameById(auction.item.id);
        const serverName = server.data.realms[0].name.fr_FR;
        const region = server.data.realms[0].category.fr_FR;
        const price = auction.buyout / 10000;
        return `
        identifier : ${auction.id}
        il s'agit de l'objet suivant : ${nameItem}
        que tu pourras trouver sur ce serveur : ${serverName} - ${region}
        Dans l'hotel des vente : ${faction}
        au prix de : ${price} golds
        `;
    }
    _isAuctionAlreadyNotified(auctionId) {
        const itemsFound = fs.readFileSync('itemsFound.json');
        return JSON.parse(itemsFound).auctionsId.includes(auctionId);
    }
    _setAuctionToNotified(auctionId) {
        if (this._isAuctionAlreadyNotified(auctionId))
            return;
        const itemsFound = fs.readFileSync('itemsFound.json');
        const newItemsFound = JSON.parse(itemsFound);
        newItemsFound.auctionsId.push(auctionId);
        fs.writeFileSync('itemsFound.json', JSON.stringify(newItemsFound));
    }
    _sendSms(text, auctionId) {
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
