'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');

const http = require('https');
const host = 'api.infermedica.com';
const appId = '23c309ab';
const appKey = '977d3f7eadfc3a467e624d7b8bef64b3';

admin.initializeApp(functions.config().firebase);
var db = admin.firestore();
const dbRefInitialSyndrome = db.collection('user1').doc('initial_syndrome');
const dbRefDiagnosisResult = db.collection('user1').doc('diagnosis_result');
const INITIAL_SYNDROME = 0;
const FOLLOWUP_SYNDROME = 1;
const USER_RESPONSE_YES = "present";
const USER_RESPONSE_NO = "absent";
const USER_RESPONSE_MAYBE = "unknown";

exports.medicWebhook = functions.https.onRequest((req, res) => {
	processRequest(req, res)

});

function processRequest(request, response) {
	let action = request.body.result.action;
	let syndrome = request.body.result.parameters['syndrome'];
	console.log('action : ' + action);

	const actionHandler = {
		'smalltalk.greetings.hello': () => {
			console.log('greetings');
			let message = `Hello! Hi! I'm an automatic symptom checker.
			 				I'll guide you through a simple interview. Do you want to start now?`;
			let responseToUser = {
				speech: message, // spoken response
				text: message // displayed response
			};
			sendResponse(responseToUser);

		},
		'begin.check': () => {
			let message = `I'll do my best to explain common health issues, such as headache, fatigue or stomach ache.
			 What concerns you most about your health? Please describe your symptoms.`;
			let responseToUser = {
				speech: message, // spoken response
				text: message // displayed response
			};
			sendResponse(responseToUser);
		},
		'get.initial.syndrome': () => {
			getInitialSyndrome(syndrome).then((output) => {	
				recordSyndrome(output);
				let outputContexts = '';
				for(var i = 0; i < output.length; i ++){
					console.log("choice id = " + output[0].choice_id);
					if(output[i].choice_id == 'present'){
						if(i > 0)
							outputContexts += ', ';
						outputContexts += output[i].name;
					}
				}
				let message = '';
				if(outputContexts == '')
					message = `Please describe your symptoms.`;
				else
				    message = `Do you mean: ${outputContexts}?`;				
				let responseToUser = {
					speech: message, // spoken response
					text: message // displayed response
				};
				sendResponse(responseToUser);
			})
		},
		'symptom.confirmation.yes': () => {
			let message = `Alright! What else you want to report?`;
			let responseToUser = {
				speech: message, // spoken response
				text: message // displayed response
			};
			sendResponse(responseToUser);
		},
		'symptom.confirmation.no': () => {
			let message = `I will skip that. Please describe it again.`;
			let responseToUser = {
				speech: message, // spoken response
				text: message, // displayed response
				messages:  [
					        {
					          "type": 0,
					          "speech": message
					        },
					        {
					          "type": 0,
					          "speech": "Try using simple phrases such as lower back pain, fever."
					        }
					      ]
			};
			sendResponse(responseToUser);
		},
		'diagnosis': () =>{
			dbRefInitialSyndrome.get().then((doc) => { 
			
			getResult(doc, INITIAL_SYNDROME, null).then((output) => {	
				//let message = `Okay, let me ask you a couple of questions.`;
				let message_1 = output;
				let responseToUser = {
					speech: message_1,
					messages:[
						        // {
						        //   "type": 0,
						        //   "speech": message
						        // },
						        {
						          "type": 0,
						          "speech": message_1
	  					        }
						      ]
				}
				sendResponse(responseToUser);
				})
			})
		},
		'response.yes': () =>{
			dbRefDiagnosisResult.get().then((doc) => {

				getResult(doc, FOLLOWUP_SYNDROME, USER_RESPONSE_YES).then((output) => {	
				
					let message = output;
					let responseToUser = {
						messages:[
							        {
							          "type": 0,
							          "speech": message
							        }
							      ]
					}
					sendResponse(responseToUser);
					})
				})
		},
		'response.no': () =>{
			dbRefDiagnosisResult.get().then((doc) => {

				getResult(doc, FOLLOWUP_SYNDROME, USER_RESPONSE_NO).then((output) => {	
				let message = output;
				let responseToUser = {
					messages:[
						        {
						          "type": 0,
						          "speech": message
						        }
						      ]
				}
				sendResponse(responseToUser);
					})
				})
		}
	};

	if (!actionHandler[action] || action == 'input.welcome') {
		action = 'smalltalk.greetings.hello';
	}
	actionHandler[action]();

	// Function to send correctly formatted responses to Dialogflow which are then sent to the user
	function sendResponse(responseToUser) {
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
			responseJson.messages = responseToUser.messages;
			// Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
			responseJson.data = responseToUser.data;
			// Optional: add contexts (https://dialogflow.com/docs/contexts)
			responseJson.contextOut = responseToUser.outputContexts;
			console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
			response.json(responseJson); // Send response to Dialogflow
		}
	}
}

function getInitialSyndrome(value) {
	return new Promise((resolve, reject) => {
		// Create the path for the HTTP request to get the weather

		var option = httpRequestBuilder(2, 'parse');
		var req = http.request(option, (res) => {
			console.log("response code " + res.statusCode);
			let body = '';
			console.log("body: " + body); // var to store the response chunks
			res.on('data', (d) => {
				body += d;
			}); // store each response chunk
			console.log("body 2:" + body.toString());
			res.on('end', () => {
				// After all the data has been received parse the JSON for desired data
				let response = JSON.parse(body);
				var output = new Array();
				console.log(response);
				let syndrome = response.mentions;
				for (var i = 0; i < syndrome.length; i++) {
					output.push(
						{   id : syndrome[i]['id'],
							name : syndrome[i]['name'],
						  choice_id :  syndrome[i]['choice_id']
						});
				}

				// Resolve the promise with the output text
				console.log(output);
				resolve(output);
			});
			res.on('error', (error) => {
				reject(error);
			});
		});
		req.write(JSON.stringify({
			text: value,
			correct_spelling : true
		}));
		req.end();
	});
}

function getResult(value, statusCode, userResponse) {
	return new Promise((resolve, reject) => {
		// Create the path for the HTTP request to get the weather

		var evidences = getUserResponse(value, statusCode, userResponse);
		console.log("evidence: " + JSON.stringify(evidences));
		

	    var data = {
				sex : "male", 
		    	age : 35, 
		    	evidence : evidences, 
		    	extras : {"disable_groups" : true}
			}

		recordCollectedResult(data);

		console.log(JSON.stringify(value));

		var option = httpRequestBuilder(2, 'diagnosis');
		var req = http.request(option, (res) => {
			console.log("response code " + res.statusCode);
			let body = '';
	        // var to store the response chunks
			res.on('data', (d) => {
				body += d;
			}); // store each response chunk
			res.on('end', () => {
				// After all the data has been received parse the JSON for desired data
				let response = JSON.parse(body);
				console.log("get result body: " + body);
				console.log("get result response: " + JSON.stringify(response));
				recordCurrentResult(response);

				let hints = checkDiagnosisCompletion(response);
				let question = null;

				if(hints != null){
					question = hints;
				} else {
					question = response.question.text;
				}

				console.log("question: " + question);


				resolve(question);
			});

			res.on('error', (error) => {
				reject("error" + error);
			});

		});

		req.write(JSON.stringify(data));

		req.end();
	});
}

function getUserResponse(value, statusCode, userResponse) {
	var output = new Array();

	if(statusCode == INITIAL_SYNDROME) {
			let initial = value.data().initial;
		    
		     
	        for(var i = 0; i < initial.length; i++) {
	    	output.push(
	    	{
	    		choice_id : initial[i]['choice_id'],
	    		id : initial[i]['id'],
	    		initial : true
	    	});
	    }

	} else {
		let evidence = value.data().collected_result.evidence;

		for(var i = 0; i < evidence.length; i++) {
			var init = evidence[i]['initial'] ? true : false;
	    	output.push(
	    	{
	    		choice_id : evidence[i]['choice_id'],
	    		id : evidence[i]['id'],
	    		initial : init
	    	});

		}
		let syndromeId = value.data().current_result.question.items[0]['id'];
		output.push(
		{
			choice_id : userResponse,
			id : syndromeId,
			initial : false
		});
	}

 	return output;
}

function getCondition (value) {
  return new Promise((resolve, reject) => {
    // Create the path for the HTTP request to get the weather
    value = encodeURI(value);
    var option = httpRequestBuilder(1, `conditions/${value}`);
    http.get(option, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });  // store each response chunk
      console.log("get condition body: " + body);
      res.on('end', () => { 
        // After all the data has been received parse the JSON for desired data
        let response = JSON.parse(body);
        console.log("get condition response: " + JSON.stringify(response));
        
        let name = response.name;
        let category = response.categories[0];
        let prevalence = response.prevalence;
        let severity = response.severity
        let hints = response.extras.hint;

        let message = `Your condition is ${name} which is under ${category} category. This condition is ${prevalence} and ${severity}. ${hints}`;

        resolve(message);
      });
      res.on('error', (error) => {
        reject(error);
      });
    });
  });
}

function httpRequestBuilder(method, params) {
	// Create the path for the HTTP request to get the weather
	var requestMethod = ((reqMethod) => {
		switch (reqMethod) {
			case 1:
				return 'GET';
			case 2:
				return 'POST';
		}
	})(method);
	let path = '/v2/' + params
	console.log('API Request: ' + host + path);
	// Make the HTTP request to get the weather
	return {
		host: host,
		path: path,
		method: requestMethod,
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'App-Id': appId,
			'App-Key': appKey,
			'Dev-Mode': true
		}
	};
}

function checkDiagnosisCompletion(value) {

	if(value.should_stop) {
		let condId = value.conditions[0]['id'];
		var hints = getCondition(condId).then((hints) => {	
			return hints;
		});

		return hints;

	} else {
		return null;
	}
	

}

function recordSyndrome(output){
	var data = {
		initial : output
		}
		var setDoc = dbRefInitialSyndrome.set(data);
	}

function recordCurrentResult(output){
	var data = {
		current_result : output
	}
	var setDoc = dbRefDiagnosisResult.update(data);
}

function recordCollectedResult(output){
	var data = {
		collected_result : output
	}
	var setDoc = dbRefDiagnosisResult.update(data);
}

