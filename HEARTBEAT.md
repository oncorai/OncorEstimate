# HEARTBEAT.md

## Check Twilio for incoming SMS/voicemails
- Poll Twilio API for messages received on +19282676489 since last check
- Forward any new incoming texts to JFS on Telegram immediately
- Check for voicemail transcriptions too
- Track last check timestamp in memory/heartbeat-state.json

## Daily market briefing (7 AM Mountain = 14:00 UTC)
- Check BTC price and 24h trend (CoinGecko API)
- Check SPY/QQQ direction (Yahoo Finance)
- Check DXY (dollar index)
- Check gold (GLD) 
- Check for major macro news
- Send Telegram summary to JFS with: prices, trends, rotation signals, any trade setups
- Only send if it's between 13:00-15:00 UTC OR there's a significant market event

## Intraday alerts
- If BTC moves >5% in either direction — alert immediately
- If SPY moves >2% — alert with context
- If gold and equities both selling off simultaneously — alert (deleveraging signal)
- If BTC breaks a key level (track last known support/resistance) — alert
