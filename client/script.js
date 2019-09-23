(function(global){
  
    global.chat = {
      messageToSend: '',
      init: function() {
        this.cacheDOM();
        this.bindEvents();
        this.render();
      },
      cacheDOM: function() {
        this.$chatHistory = $('.chat-history');
        this.$button = $('button');
        this.$chatHistoryList =  this.$chatHistory.find('ul');
      },
      bindEvents: function() {
      },
      render: function() {
        this.scrollToBottom();
        if (this.messageToSend.trim() !== '') {
          var template = Handlebars.compile( $("#message-template").html());
          var context = { 
            messageOutput: this.messageToSend,
            time: this.getCurrentTime()
          };
  
          this.$chatHistoryList.append(template(context));
          this.scrollToBottom();               
        }
        
      },

      showIndicator: function() {
        if ($("#input-indicator")[0] !== undefined) return
        var indicator = Handlebars.compile( $("#indicator-template").html());
        this.$chatHistoryList.append(indicator({time: this.getCurrentTime()}));
        this.scrollToBottom();
      },

      hideIndicator: function() {
        $('#input-indicator').remove()
      },
      
      addMessage: function(txt) {
        this.messageToSend = txt
        this.render();         
      },
      addResponse: function(txt) {
        var templateResponse = Handlebars.compile( $("#message-response-template").html());
        var contextResponse = { 
          response: txt,
          time: this.getCurrentTime()
        };
        this.$chatHistoryList.append(templateResponse(contextResponse));
        this.scrollToBottom();
      },
      addMessageEnter: function(event) {
          // enter was pressed
          if (event.keyCode === 13) {
            this.addMessage();
          }
      },
      scrollToBottom: function() {
         this.$chatHistory.scrollTop(this.$chatHistory[0].scrollHeight);
      },
      getCurrentTime: function() {
        return new Date().toLocaleTimeString().
                replace(/([\d]+:[\d]{2})(:[\d]{2})(.*)/, "$1$3");
      },
      getRandomItem: function(arr) {
        return arr[Math.floor(Math.random()*arr.length)];
      }
      
    };
    
    chat.init();    

  })(window);

// TODO: change to your Voximplant phone number
var callee = "19292435993",
caller = "",
session = "",
// TODO: change to your ngrok server name
server = "3cf17799.ngrok.io"

function connectSocket() {
var socket = io('http://'+server, { path: '/socket.io' })
socket.on('connect', function(){
console.log('ws connected')
})
socket.on('data:'+callee, data => {            
console.log(data)
try {
    if (data.result != null) {
        let result = JSON.parse(data.result)
        if (result.status == "agent_response") {
            chat.addMessage(result.text)
        }  
        if (result.status == "capturing") {
            chat.showIndicator()
        }
        if (result.status == "speech_captured") {
            chat.hideIndicator()
            chat.addResponse(result.text)
        }
        if (result.status == "call_connected") {   
          $('#intervene-button, #disconnect-button').show()                   
          $('#caller-id').html("Chat with "+result.caller)
          caller = result.caller
          session = result.session
        }
        if (result.status == "call_disconnected") {
          $('#intervene-button, #disconnect-button').hide()  
          $('#caller-id').html("No Active Calls")
        }
    }
} catch(err) {
    console.error(err)
}
})
socket.on('disconnect', function(){
  console.log('ws disconnected')
})
}

$.ajax({
url: 'http://'+server+'/setCallee?callee='+callee,
success: (res) => {
  if (res.result !== undefined) {
      connectSocket()          
  }
},
error: (jqXHR, textStatus, errorThrown) => {
    console.error(errorThrown)
},
dataType: 'json',
type: 'POST',
xhrFields: {
    withCredentials: true
}
})

$('#intervene-button').on('click', function() {
$.post(session, { 'command': 'intervene' }, () => {}, 'json')
})
$('#disconnect-button').on('click', function() {
$.post(session, { 'command': 'disconnect' }, () => {}, 'json')
})
  