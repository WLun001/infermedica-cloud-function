'use strict';
const functions = require('firebase-functions');
const admin = require('firebase-admin');

const http = require('https');
const host = 'api.infermedica.com';
const appId = '23c309ab';
const appKey = '977d3f7eadfc3a467e624d7b8bef64b3';

admin.initializeApp(functions.config().firebase);
var db = admin.firestore();

var dbRefInitialSyndrome = null;
var dbRefDiagnosisResult = null;
var dbRefDiagnosisHistory = null;
var dbRefReportLog = null;
var dbRefReportQuestion = null;
var dbRefMedicReport = null;
const INITIAL_SYNDROME = 0;
const FOLLOWUP_SYNDROME = 1;
const USER_RESPONSE_YES = "present";
const USER_RESPONSE_NO = "absent";
const USER_RESPONSE_MAYBE = "unknown";

exports.medicWebhook = functions.https.onRequest((req, res) => {
    processRequest(req, res)

});

function processRequest(request, response) {
    //sessionId is the user id passed from Dialogflow
    var userId = request.body.sessionId

    dbRefInitialSyndrome = db.collection('users').doc(userId).collection('diagnosis_data').doc('initial_syndrome');
    dbRefDiagnosisResult = db.collection('users').doc(userId).collection('diagnosis_data').doc('diagnosis_result');
    dbRefDiagnosisHistory = db.collection('users').doc(userId).collection('diagnosis_data').doc('diagnosis_history');
    dbRefReportQuestion = db.collection('users').doc(userId).collection('diagnosis_data').doc('report_question');
    dbRefMedicReport = db.collection('users').doc(userId).collection('medic_report');
    console.log("user id: " + userId)
    //use action from Dialogflow to handle tasks
    let action = request.body.result.action;
    let syndrome = request.body.result.parameters['syndrome'];
    console.log('action : ' + action);

    const actionHandler = {
        'smalltalk.greetings.hello': () => {
            console.log('greetings');
            let message = `Hello! Hi! I'm an automatic symptom checker.
                            I'll guide you through a simple interview. Do you want to start now?`;
            let responseToUser = {
                messages: [{
                    "type": 0,
                    "speech": message
                }]
            };
            sendResponse(responseToUser);

        },
        'begin.check': () => {
            let message = `I'll do my best to explain common health issues, such as headache, fatigue or stomach ache.
             What concerns you most about your health? Please describe your symptoms.`;
            let responseToUser = {
                messages: [{
                    "type": 0,
                    "speech": message
                }]
            };
            sendResponse(responseToUser);
        },
        'get.initial.syndrome': () => {
            getInitialSyndrome(syndrome).then((output) => {
                recordSyndrome(output);
                let outputContexts = '';
                for (var i = 0; i < output.length; i++) {
                    console.log("choice id = " + output[0].choice_id);
                    if (output[i].choice_id == 'present') {
                        if (i > 0)
                            outputContexts += ', ';
                        outputContexts += output[i].name;
                    }
                }
                let message = '';
                if (outputContexts == '')
                    message = `Please describe your symptoms.`;
                else
                    message = `Do you mean: ${outputContexts}?`;
                let responseToUser = {
                    messages: [{
                        "type": 0,
                        "speech": message
                    }]
                };
                sendResponse(responseToUser);
            })
        },
        'symptom.confirmation.yes': () => {
            let message = `Alright! What else you want to report?`;
            let responseToUser = {
                messages: [{
                    "type": 0,
                    "speech": message
                }]
            };
            sendResponse(responseToUser);
        },
        'symptom.confirmation.no': () => {
            let message = `I will skip that. Please describe it again.`;
            let responseToUser = {
                messages: [{
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
        'diagnosis': () => {
            dbRefInitialSyndrome.get().then((doc) => {

                getResult(doc, INITIAL_SYNDROME, null).then((output) => {
                    let message = `Okay, let me ask you a couple of questions.`;
                    output.splice(0, 0, {
                        "type": 0,
                        "speech": message
                    });
                    let responseToUser = {
                        messages: output
                    }
                    sendResponse(responseToUser);
                })
            })
        },
        'response.yes': () => {
            dbRefDiagnosisResult.get().then((doc) => {

                getResult(doc, FOLLOWUP_SYNDROME, USER_RESPONSE_YES).then((output) => {

                    let responseToUser = {
                        messages: output
                    }
                    sendResponse(responseToUser);
                })
            })
        },
        'response.no': () => {
            dbRefDiagnosisResult.get().then((doc) => {

                getResult(doc, FOLLOWUP_SYNDROME, USER_RESPONSE_NO).then((output) => {
                    let responseToUser = {
                        messages: output
                    }
                    sendResponse(responseToUser);
                })
            })
        },
        'response.maybe': () => {
            dbRefDiagnosisResult.get().then((doc) => {

                getResult(doc, FOLLOWUP_SYNDROME, USER_RESPONSE_MAYBE).then((output) => {
                    let responseToUser = {
                        messages: output
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

/**
* perform http request to infermedica NLP to analyse syndrome from user at the beginning
* @param {string} value - Syndrome from user 
* @return {Promise} array of syndromes
*/
function getInitialSyndrome(value) {
    return new Promise((resolve, reject) => {
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
                let syndrome = response.mentions;
                console.log(response);
                
                for (var i = 0; i < syndrome.length; i++) {
                    output.push({
                        id: syndrome[i]['id'],
                        name: syndrome[i]['name'],
                        choice_id: syndrome[i]['choice_id']
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
            correct_spelling: true
        }));
        req.end();
    });
}

/**
* perform interview with user, send user response to and get result from the infermedica api
* @param {snapshot} value - snapshot from database
* @param {int} statusCode -  to determine what is the caller action, either is INITIAL_SYNDROME or FOLLOWUP_SYNDROME
* @param {string} userResponse - response from user, either is USER_RESPONSE_YES, const USER_RESPONSE_NO or USER_RESPONSE_MAYBE
* @returnn {Promise} array of questions from infermedica api
*/
function getResult(value, statusCode, userResponse) {
    return new Promise((resolve, reject) => {

        var evidences = getUserResponse(value, statusCode, userResponse);
        console.log("evidence: " + JSON.stringify(evidences));

        //construct request format to be sent
        var data = {
            sex: "male",
            age: 35,
            evidence: evidences,
            extras: {
                "disable_groups": true
            }
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

                var answer = new Array();
                //check if the interview should be stop
                let hints = checkDiagnosisCompletion(response);

                if (hints != null) {
                    answer = hints;
                } else {
                    let probability = response.conditions[0]['probability'];
                    let condition = response.conditions[0]['common_name'];
                    var messages = "";

                    if (probability != null) {
                        messages = `Please bear with me, the diagnosis will carry on. Your current condition is having ${(probability*100).toFixed(2)}% of ${condition}.`;
                        answer.push({
                            type: 0,
                            speech: messages

                        });
                    }

                    let question = response.question.text;

                    answer.push({
                        type: 0,
                        speech: question
                    });
                }
                resolve(answer);
            });

            res.on('error', (error) => {
                reject("error" + error);
            });
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

/**
* process response from user
* @param {snapshot} value - snapshot from database
* @param {int} statusCode -  to determine what is the caller action, either is INITIAL_SYNDROME or FOLLOWUP_SYNDROME
* @param {string} userResponse - response from user, either is USER_RESPONSE_YES, const USER_RESPONSE_NO or USER_RESPONSE_MAYBE
* @return {array} array if json object that store user choice to every symdrome
*/
function getUserResponse(value, statusCode, userResponse) {
    var output = new Array();

    if (statusCode == INITIAL_SYNDROME) {
        let initial = value.data().initial;

        for (var i = 0; i < initial.length; i++) {
            output.push({
                choice_id: initial[i]['choice_id'],
                id: initial[i]['id'],
                initial: true
            });
        }

    } else {
        let evidence = value.data().collected_result.evidence;

        for (var i = 0; i < evidence.length; i++) {
            var init = evidence[i]['initial'] ? true : false;
            output.push({
                choice_id: evidence[i]['choice_id'],
                id: evidence[i]['id'],
                initial: init
            });

        }
        let syndromeId = value.data().current_result.question.items[0]['id'];
        output.push({
            choice_id: userResponse,
            id: syndromeId,
            initial: false
        });

        recordReportQuestion(value, userResponse);
    }

    return output;
}

/**
* get condition from a condition id
* @param {string} value - condition_id
* @return {Promise} array of messages 
*/
function getCondition(value) {
    return new Promise((resolve, reject) => {
        value = encodeURI(value);
        var option = httpRequestBuilder(1, `conditions/${value}`);
        http.get(option, (res) => {
            let body = '';
            res.on('data', (d) => {
                body += d;
            }); // store each response chunk
            console.log("get condition body: " + body);
            res.on('end', () => {
                // After all the data has been received parse the JSON for desired data
                let response = JSON.parse(body);
                console.log("get condition response: " + JSON.stringify(response));

                recordDiagnosisHistory(response);
                generateReport(response);

                let name = response.name;
                let category = response.categories[0];
                let prevalence = response.prevalence;
                let severity = response.severity
                let hints = response.extras.hint;

                let message = [{
                        type: 0,
                        speech: `Your condition is ${name} which is under ${category} category.`
                    },
                    {
                        type: 0,
                        speech: `This condition is ${prevalence} and ${severity}.`
                    },
                    {
                        type: 0,
                        speech: `${hints}`
                    }

                ];

                resolve(message);
            });
            res.on('error', (error) => {
                reject(error);
            });
        });
    });
}

/**
* helper method to construct http request
* @param {int} method - to determine http method, either is GET or POST
* @param {string} params - params to added the reqeust url
* @return {json} http header
*/
function httpRequestBuilder(method, params) {
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

/**
* check diagnose completion
* @param {json} value - the json to be check
* @return {string} hints of the condition if there diagnose should stop
*/
function checkDiagnosisCompletion(value) {
    if (value.should_stop) {
        let condId = value.conditions[0]['id'];
        var hints = getCondition(condId).then((hints) => {
            return hints;
        });

        return hints;

    } else {
        return null;
    }
}

/**
* save syndrome to database
* @param {string} output - the data to be saved to database
*/
function recordSyndrome(output) {
    var data = {
        initial: output
    }

    var setDoc = dbRefInitialSyndrome.set(data);
}

/**
* save diagnose history to database
* @param {string} output - the data to be saved to database
*/
function recordDiagnosisHistory(output) {
    var data = {
        history: output
    }

    var setDoc = dbRefDiagnosisHistory.set(data);
}

/**
* save current result of the diagnose to database
* @param {string} output - the data to be saved to database
*/
function recordCurrentResult(output) {
    var data = {
        current_result: output
    }
    dbRefDiagnosisResult.get()
        .then((docSnapshot) => {
            if (docSnapshot.exists) {
                dbRefDiagnosisResult.update(data)
            } else {
                dbRefDiagnosisResult.set(data);
            }
        });
}

/**
* save collected result from the diagnose (previous user response) to database
* @param {string} output - the data to be saved to database
*/
function recordCollectedResult(output) {
    var data = {
        collected_result: output
    }
    dbRefDiagnosisResult.get()
        .then((docSnapshot) => {
            if (docSnapshot.exists) {
                dbRefDiagnosisResult.update(data);
            } else {
                dbRefDiagnosisResult.set(data);
            }
        });
}

/**
* save questions that have asked user to database
* @param {string} output - the data to be saved to database
* @param {string} userResponse - response from user, either is USER_RESPONSE_YES, const USER_RESPONSE_NO or USER_RESPONSE_MAYBE
*/
function recordReportQuestion(output, userResponse) {

    let question = new Array();
    if (output.data().question) {
        question = output.data().question;
    }
    let ques = output.data().current_result.question.text;
    let id = output.data().current_result.question.items[0]['id'];
    let name = output.data().current_result.question.items[0]['name'];

    var newQues = {
        symptom_id: id,
        symptom: name,
        question: ques,
        user_response: userResponse
    }
    question.push(newQues);

    var data = {
        question: question
    }

    dbRefDiagnosisResult.get()
        .then((docSnapshot) => {
            if (docSnapshot.exists) {
                dbRefDiagnosisResult.update(data);
            } else {
                dbRefDiagnosisResult.set(data);
            }
        });

}

/**
* generate report of diagnosis
* @param {string} output - the data to be saved to database
*/
function generateReport(condition) {
    var initialSyndrome;
    var currentResult;
    var question;
    console.log("Generating report");

    dbRefInitialSyndrome.get()
        .then((doc) => {
            initialSyndrome = doc.data();
            console.log("Getting initial_syndrome");

            dbRefDiagnosisResult.get()
                .then((doc) => {
                    currentResult = doc.data().current_result;
                    question = doc.data().question;
                    console.log("Getting current_result");

                    var data = {
                        initial: initialSyndrome,
                        possible_conditions: currentResult,
                        diagnose_condition: condition,
                        questions: question,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    }
                    dbRefMedicReport.add(data);
                })
        })
}