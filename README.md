## 1. Description

The application is a bot that integrates with the Telegram API and the Binance cryptocurrency exchange API.

The bot automatically converts text messages from specific Telegram channels into positions on Binance Futures in real time. Based on predefined rules and algorithms, it analyzes message content and generates corresponding buy or sell orders on the Binance futures market.

The bot operates fully autonomously, ensuring fast and precise trade execution without the need for manual intervention.


### 1.1. Signals

<div style="display: flex; gap: 20px">
    <div>
        <p>The bot listens to signal channels on Telegram. Signals are text messages containing futures position information such as</p>
        <ul>
            <li>currency pair</li>
            <li>position side - LONG/SHORT</li>
            <li>stop loss level</li>
            <li>take profit level or levels</li>
            <li>leverage</li>
        </ul>
        </br>
        <p>Properly formatted signals are processed in real-time into positions on Binance Futures for each active subscription.</p>
        <p>It is possible to support multiple signal sources. By default, signals formatted as shown in the screenshot will be supported, but there is an option to handle differently formatted messages by implementing an extension of the <strong>SignalValidator</strong> class </p>
        <br/>
        <p>Here’s an example of signal messages that the bot might process by default:</p>
    </div>
    <img src="screenshots/signals.png" width="250">
</div>



### 1.2. Positions
Here’s an example of automatically opened positions based on signals presented in screenshot - point 1.1.

![subscribe0](screenshots/positions.jpg)

If multiple take profit levels are provided, the bot will automatically divide the position value equally across the number of TP orders.

![subscribe0](screenshots/orders-cut.jpg)   
As seen in the screenshot, only one take profit order has been opened, even though the signal included multiple targets. Each subsequent TP will be placed automatically after the previous one is executed. This approach is designed to limit the number of open orders, adhering to Binance's limitations.

If the stop loss order is executed, take profit order related to that specific position will be automatically closed.

If the final take profit order is executed, the stop loss order will be automatically closed.

In case needed, there is an option to manually close positions through the Telegram chatbot.

There is also an option to manually open and close stop loss and take profit orders associated with a specific position.

<strong>The effectiveness of the bot depends on the effectiveness of analyses/signals.</strong>

</br>

     

## 2. Technologies
- NestJS
- Telegram MtProto Protocol
- Telegram Bot API
- Binance Futures API

</br>

## 3. Setup

### 3.1. Requirements

- <strong>3.1.1.</strong> Node.js installed

- <strong>3.1.2.</strong> Access to Telegram channel with signal messages. [Here's how to get the channel ID explained](https://neliosoftware.com/content/help/how-do-i-get-the-channel-id-in-telegram/)

- <strong>3.1.3.</strong> Your Telegram <strong>api_id</strong> and <strong>api_hash</strong> are required to start application listening for signal messages. [Here's how to obtain them explained](https://core.telegram.org/api/obtaining_api_id).

- <strong>3.1.4.</strong> Active Binance Futures account.

- <strong>3.1.5.</strong> You will need to set up a Telegram Bot that allows users to subscribe to this app using their Binance accounts. To create the bot and obtain the <strong>Token</strong>, simply type `/newbot` in a chat with the [BotFather](https://web.telegram.org/a/#93372553) on Telegram and follow the instructions provided.
- <strong>3.1.6.</strong> MongoDB access. The simplest way to access a MongoDB database is by creating an account on [MongoDB Atlas](https://account.mongodb.com/account/login) and obtaining the connection <strong>URI</strong>.


### 3.2. Steps

#### 3.2.1 Run the application:

- Create project directory, open it with terminal and run: 
```
git clone https://github.com/pawelmat142/binance-bot.git ./
npm i
```
- Create a file named `.env` in the project directory and fill required environment variables: 
```
MONGO_URI=<see 3.1.6.>

TELEGRAM_API_ID=<see 3.1.3.>
TELEGRAM_API_HASH=<see 3.1.3.>
TELEGRAM_PHONE_NUMBER=<see 3.1.3.>

TELEGRAM_BOT_PUBLIC_CHANNEL_TOKEN=<see 3.1.5.>
```
- Create a file named `signal-sources.json` in the project directory and populate it with the channel_id obtained in step 3.1.2.:

```
[
    {
        "name": "DEFAULT",
        "telegramChannelId": "<channel_id>"
    }
]
```
Note: Multiple channels may be provided here, allowing the application to listen to several channels simultaneously. 
- Now run in the terminal: 
```
npm start
```
- Once the application is running, you will be prompted to enter a login code. This code will be sent to you via Telegram:

![Home Screen](screenshots/mtprotoauth.png)

- The application is now listening for incoming messages on the specified channels. If the messages meet the signal criteria, they will be processed for all active subscriptions.

- In the next step, how to add subscriptions will be explained. 

#### 3.2.2 Subscribe with Binance Futures account

- By Telegram send any message to bot what you created in step <strong>3.1.5</strong>
- Select `How to generate API key?` The bot will explain how to generate API key...
- After generating the API keys, select `Subscribe` and follow the instructions to complete your subscription.
- After activating the subscription, the bot will automatically manage positions related to incoming signals in real time.


| ![subscribe0](screenshots/s0.jpg) | ![subscribe1](screenshots/start1.jpg) | ![subscribe2](screenshots/start2.jpg) 
|--------------------------------------|---------------------------------------------|--------------------------------------|
| ![subscribe3](screenshots/start3.jpg) | ![subscribe4](screenshots/start4.jpg) 

