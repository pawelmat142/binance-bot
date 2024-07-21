## Description

Application is a bot that works with the Telegram API and the Binance crypto exchange API.

It listens to private signal channels on Telegram. Signals are text messages containing futures position information such as
- currency pair
- position side - LONG/SHORT
- entry price or entry zone
- stop loss level
- take profit level or levels
- leverage

It is possible to support multiple signal sources. At the moment 2 signal sources are implemented. Both have different message formats, which I have no control over as a bot programmer, so each subsequent source requires a new implementation of the so-called SignalValidator.

It is also possible to support multiple Binance accounts. The account creation process is carried out via Telegram in the form of a chatbot and requires a unique Binance API key with permission to play on Futures.

The account creation process takes place via Telegram, which ensures authentication and authorization. During the process, the unique Binance API key is checked. This means that there is no login and registration system here. You are logged in to Telegram - you have access to your bot.

After creating an account, you can manage it via Telegram, also in the form of a chatbot. Options are:
- manage USDT amount per transaction for each signal source
- view positions or orders
- close position with current market price
- add/remove position stop loss (addtional button to move SL to entry price)
- add/remove position take profits
- activte / deactivate account (inactive account will not open more positions)

The effectiveness of the bot depends on the effectiveness of analyses/signals.
