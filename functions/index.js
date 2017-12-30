		'use strict';
		const functions = require('firebase-functions');

		const http = require('https');
		const host = 'api.infermedica.com';
		const appId = '23c309ab';
		const appKey = '977d3f7eadfc3a467e624d7b8bef64b3';

		exports.medicWebhook = functions.https.onRequest((req, res) =>{
			processRequest(req, res)

		});

		 function processRequest(request, response){
		 	let action = request.body.result.action;
			let syndrome = request.body.result.parameters['syndrome'];
			console.log('action : ' + action);

			const actionHandler = {
				'smalltalk.greetings.hello': () =>{
					console.log('greetings');
					let message = `Hello! Hi! I'm an automatic symptom checker.
					 				I'll guide you through a simple interview.
					I'll do my best to explain common health issues, such as headache, fatigue or stomach ache.
	 What concerns you most about your health? Please describe your symptoms.`
					let responseToUser = {
		         	 speech: message, // spoken response
		         	 text:message // displayed response
		        	};
		        	sendResponse(responseToUser);

				},
			 	'get_syndrome_one': () =>{ 
			 		getSyndrome(syndrome).then((output) =>{
			 			let message = `Do you mean: ${output}? --from cloud function`;
			 			let responseToUser = {
		         	 speech: message, // spoken response
		         	 text: message // displayed response
		        	};
			 			sendResponse(responseToUser);
			 		})
			 	}
			 };

			 actionHandler[action]();

			  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
			  function sendResponse (responseToUser) {
			    // if the response is a string send it as a response to the user
			    if (typeof responseToUser === 'string') {
			      let responseJson = {};
			      responseJson.speech = responseToUser; // spoken response
			      responseJson.displayText = responseToUser; // displayed response
			      response.json(responseJson);
			      console.log(response); // Send response to Dialogflow
			    } else {
			      // If the response to the user includes rich responses or contexts send them to Dialogflow
			      let responseJson = {};
			      // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
			      responseJson.speech = responseToUser.speech || responseToUser.displayText;
			      responseJson.displayText = responseToUser.displayText || responseToUser.speech;
			      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
			      responseJson.data = responseToUser.data;
			      // Optional: add contexts (https://dialogflow.com/docs/contexts)
			      responseJson.contextOut = responseToUser.outputContexts;
			      console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
			      response.json(responseJson); // Send response to Dialogflow
			    }
			  }
		}

		 function getSyndrome (value) {
  return new Promise((resolve, reject) => {
    // Create the path for the HTTP request to get the weather
    value = encodeURI(value);
    var option = httpRequestBuilder(1, `search?phrase=${value}&sex=male&max_results=8&type=symptom`);
    http.get(option, (res) => {
      console.log("response code " + res.statusCode);
      let body = '';
      console.log("body: " + body); // var to store the response chunks
      res.on('data', (d) => { body += d; });  // store each response chunk
      console.log("body 2:" + body.toString());
      res.on('end', () => { 
        // After all the data has been received parse the JSON for desired data
        let response = JSON.parse(body);
        console.log(response);
        let syndrome = response[0]['label'];//[0];
        // let location = response['data']['request'][0];
        // let conditions = response['data']['current_condition'][0];
        // let currentConditions = conditions['weatherDesc'][0]['value'];
        // Create response
        let output = syndrome;
        // Resolve the promise with the output text
        console.log(output);
        resolve(output);
      });
      res.on('error', (error) => {
        reject(error);
      });
    });
  });
}

function httpRequestBuilder(method, params){
	// Create the path for the HTTP request to get the weather
	var requestMethod = ((reqMethod) =>{
		switch(reqMethod){
			case 1: return 'GET';
			case 2: return 'POST';
		}
	})(method);
    let path = '/v2/' + params
    console.log('API Request: ' + host + path);
    // Make the HTTP request to get the weather
    return {host: host,
     path: path,
     method: requestMethod,
      headers: {'Accept': 'application/json', 'App-Id': appId, 'App-Key': appKey, 'Dev-Mode': true }};

}