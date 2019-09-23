require(Modules.AI)

var dialogflow, call, hangup,
    // -- CHANGE -- to your ngrok server name
    server = "3cf17799.ngrok.io",
    call_session_url,
    caller_id,
    dialed_number,
    debounceCancelled = false,
    outbound_call

// Get session URL to let our web client communitcate with the session
VoxEngine.addEventListener(AppEvents.Started, (e) => {
  call_session_url = e.accessURL
})

// Inbound HTTP request processing
VoxEngine.addEventListener(AppEvents.HttpRequest, (e) => {
  let command = e.content.split("=")[1]
  if (command == 'disconnect') call.hangup()
  else if (command == 'intervene') {
    // Stop media between Dialogflow and the call
    call.stopMediaTo(dialogflow)
    dialogflow.stopMediaTo(call)
    dialogflow.stop()

    call.say("Connecting to Mr. Alex, please wait", Language.Premium.US_ENGLISH_FEMALE2)
    call.addEventListener(CallEvents.PlaybackFinished, (ne) => {
      call.removeEventListener(CallEvents.PlaybackFinished)
      //  -- CHANGE -- put your mobile number as the 1st param and voximplant number you bought as the 2nd
      outbound_call = VoxEngine.callPSTN("YOUR PHONE NUMBER", "VOXIMPLANT NUMBER")
      call.playProgressTone("US")
      outbound_call.addEventListener(CallEvents.Connected, onOutboungCallConnected)
      outbound_call.addEventListener(CallEvents.Disconnected, (ee) => { call.hangup() })
      outbound_call.addEventListener(CallEvents.Failed, (ee) => {
        call.say("Unfortunately, can't connect you at the moment, please try again later", Language.Premium.US_ENGLISH_FEMALE2)
        call.addEventListener(CallEvents.PlaybackFinished, VoxEngine.terminate)
      })
    })
  }
})

function onOutboungCallConnected(e) {
  VoxEngine.sendMediaBetween(call, outbound_call)
} 

// Inbound call processing
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {  
	call = e.call
  caller_id = e.callerid
  dialed_number = e.destination // store the callee number
	call.addEventListener(CallEvents.Connected, onCallConnected)
	call.addEventListener(CallEvents.Disconnected, (ce) => {
    let url = "http://"+server+"/dialogflowResult?callee=" + encodeURIComponent(dialed_number) + 
      "&data=" + encodeURIComponent(JSON.stringify({status: "call_disconnected"}))
    Net.httpRequest(url, res => Logger.write(res.code), {method: 'POST'})
    VoxEngine.terminate()
  })
	call.answer()
})

function debounce(func, wait) {
  let timeout
  return function(...args) {
    const context = this
    clearTimeout(timeout)
    timeout = setTimeout(() => {
    	if (!debounceCancelled) func.apply(context, args)
  	}, wait)
  }
}

function capturing() {
  // Notifications to client via the nodejs backend that caller is talking to our bot
  let url = "http://"+server+"/dialogflowResult?callee=" + encodeURIComponent(dialed_number) + 
            "&data=" + encodeURIComponent(JSON.stringify({status: "capturing"}))	
  Net.httpRequest(url, res => {
    Logger.write(res.code)
  }, {method: 'POST'})
}

const debouncedCapturing = debounce(capturing, 250)

function onCallConnected(e) {
  // Enable call recording
  call.record({stereo: true})
  // Notification to the client app via nodejs that the call connected
  let url = "http://"+server+"/dialogflowResult?callee=" + encodeURIComponent(dialed_number) + 
      "&data=" + encodeURIComponent(JSON.stringify({status: "call_connected", caller: caller_id, session: call_session_url }))
  Net.httpRequest(url, res => Logger.write(res.code), {method: 'POST'})
  // Create Dialogflow object
	dialogflow = AI.createDialogflow({
	  lang: DialogflowLanguage.ENGLISH_US
	})
  dialogflow.setPhraseHints(["aylarov", "mr. aylarov", "alex", "alexey", "mr. alex", "mr. alexey"])
	dialogflow.addEventListener(AI.Events.DialogflowResponse, onDialogflowResponse)
    // Sending WELCOME event to let the agent says a welcome message
    dialogflow.sendQuery({event : {name: "WELCOME", language_code:"en"}})
    // Playback marker used for better user experience
    dialogflow.addMarker(-300)
    // Start sending media from Dialogflow to the call
    dialogflow.sendMediaTo(call)
    dialogflow.addEventListener(AI.Events.DialogflowPlaybackFinished, (e) => {
      debounceCancelled = false
      // Dialogflow TTS playback finished. Hangup the call if hangup flag was set to true
      if (hangup) call.hangup()
    })
    dialogflow.addEventListener(AI.Events.DialogflowPlaybackStarted, (e) => {
      // Dialogflow TTS playback started
    })
    dialogflow.addEventListener(AI.Events.DialogflowPlaybackMarkerReached, (e) => {
      // Playback marker reached - start sending audio from the call to Dialogflow
      call.sendMediaTo(dialogflow)
    })
}

// Handle Dialogflow responses
function onDialogflowResponse(e) {
  // Received speech recognition results only
  if (e.response.recognitionResult !== undefined) {
      if (e.response.recognitionResult.isFinal) {
        debounceCancelled = true
        // Notification to the client app via nodejs that the caller said something
        let url = "http://"+server+"/dialogflowResult?callee=" + encodeURIComponent(dialed_number) + 
                  "&data=" + encodeURIComponent(JSON.stringify({status: "speech_captured", text: e.response.recognitionResult.transcript}))
      			Net.httpRequest(url, res => Logger.write(res.code), {method: 'POST'})
      } else debouncedCapturing()
  }
  // If DialogflowResponse with queryResult received - the call stops sending media to Dialogflow
  // in case of response with queryResult but without responseId we can continue sending media to dialogflow
  else if (e.response.queryResult !== undefined && e.response.responseId === undefined) {
    call.sendMediaTo(dialogflow)
  } else if (e.response.queryResult !== undefined && e.response.responseId !== undefined) {
  	// Do whatever required with e.response.queryResult or e.response.webhookStatus
        // If we need to hangup because end of conversation has been reached
        if (e.response.queryResult.diagnosticInfo !== undefined && 
           e.response.queryResult.diagnosticInfo.end_conversation == true) {
           hangup = true
        }

    // Telephony messages arrive in fulfillmentMessages array
    if (e.response.queryResult.fulfillmentMessages != undefined) {
      // Notification to the client app via nodejs that Dialogflow result arrived
      let url = "http://"+server+"/dialogflowResult?callee=" + encodeURIComponent(dialed_number) + 
                  "&data=" + encodeURIComponent(JSON.stringify({status: "agent_response", text: e.response.queryResult.fulfillmentText}))
      			Net.httpRequest(url, res => Logger.write(res.code), {method: 'POST'})

    	e.response.queryResult.fulfillmentMessages.forEach((msg) => {
      		if (msg.platform !== undefined && msg.platform === "TELEPHONY") processTelephonyMessage(msg)
    	})
  	}
  }
}

// Process telephony messages from Dialogflow
function processTelephonyMessage(msg) {
  // Transfer call to msg.telephonyTransferCall.phoneNumber
  if (msg.telephonyTransferCall !== undefined) {
  	/**
    * Example:
    * dialogflow.stop()
    * let newcall = VoxEngine.callPSTN(msg.telephonyTransferCall.phoneNumber, "put verified CALLER_ID here")
    * VoxEngine.easyProcess(call, newcall)
    */
  }
  // Synthesize speech from msg.telephonySynthesizeSpeech.text
  if (msg.telephonySynthesizeSpeech !== undefined) {
    // See the list of available TTS languages at https://voximplant.com/docs/references/voxengine/language
    // Example: call.say(msg.telephonySynthesizeSpeech.text, Premium.US_ENGLISH_FEMALE)
  }
  // Play audio file located at msg.telephonyPlayAudio.audioUri
  if (msg.telephonyPlayAudio !== undefined) {
    // audioUri contains Google Storage URI (gs://), we need to transform it to URL (https://)
    let url = msg.telephonyPlayAudio.audioUri.replace("gs://", "https://storage.googleapis.com/")
    // Example: call.startPlayback(url)
  }
}