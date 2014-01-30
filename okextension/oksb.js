var OKCupid = (function(){
    var OkCupidStorage = {
        myusername: '',
        users: {},
        id: 0
    };

    var OkCupidAPI = {
        storeQuestions: function(questions, callback) {
            var msg = {
                oksbu: OkCupidStorage.myusername,
                packets: questions
            };
            $.ajax({
                type: 'POST',
                url: 'http://www.oksuperboost.appspot.com/oksb.g',
                data: JSON.stringify(msg),
                contentType: "application/json",
                dataType: 'json'
            })
            .done(function(data) {
            	callback({ data: data });
            })
			.fail(function(jqXHR, textStatus, errorThrown) {
				callback({ error: errorThrown });
			});         
        },

        fetchUsers: function (callback) {
            $.get('http://www.okcupid.com/match?&mobile_app=1&mobile_app_device=android', function(data) {
                if (!data) {
                    callback({ error: 'Connection Error'});
                    return;
                }

                if (data.indexOf('"ISLOGGEDIN" : 0') != -1) {
                    callback({ error: 'Not Logged In'});
                    return;
                }

                var $el = $(data);
                var startmatch = '", "screenname" : "';
                  var endmatch = '", "language_code"';
                var myusername = data.slice(data.indexOf(startmatch) + startmatch.length, data.indexOf(endmatch));
                OkCupidStorage.myusername = myusername;
                var $users = $el.find('ul#match_results li');
                if (!$users.length) {
                    callback({ error: 'Connection Error'});
                    return;
                }
                var users = [];
                $users.each(function(i) {
                       var profile = $(this).attr('id');
                    if (profile) {
                        var uname = profile.slice(4);
                        if(uname && uname !== '_more_match' ) {
                            users.push(uname);
                        }
                    }
                });
                callback(users);
            })
			.fail(function(jqXHR, textStatus, errorThrown) {
				callback({ error: errorThrown });
			});
        },

        fetchQuestions: function (username, callback) {
	        if (!username) {
		        callback({skip: 'undefined username'});
		        return;
	         }
            if (OkCupidStorage.users[username]) {
                callback({skip: 'Duplicate ' + username});
                return;
            }
            $.getJSON('http://www.okcupid.com/profile/'+username+'/questions?n=9&low=1&append=1&json=1&she_care=1&mobile_app=1&mobile_app_device=android', function(data) {
                if (!data.ISLOGGEDIN) {
                    callback({error: 'Not Logged In'});
                    return;
                }
                var $content = $(data.content);
                var $questions = $content.find('> li');
                var questions = [];
                $questions.each(function(q) {
                    var $question = $(this);
                    var id = $question.attr('id').substring('9');
                    var title = $question.find('h4').text();
                    var herAnswer = null;
                    var myAnswer = null;
                    var $answers = $question.find('.answer');
                    if ($answers.length) {
                        herAnswer = $question.find('#answer_target_' + id).text();
                        myAnswer = $question.find('#answer_viewer_' + id).text();
                        questions.push({
                            question: title,
                            herAnswer: herAnswer,
                            myAnswer: myAnswer
                        });
                    }
                });

                if (questions.length) {
                    OkCupidStorage.users[username] = questions;
                    callback({
                        username: username,
                        questions: questions
                    });
                }
                else {
                    callback({skip: 'Empty ' + username })
                }
            })
			.fail(function(jqXHR, textStatus, errorThrown) {
				callback({ skip: errorThrown });
			});
        }
    }

    var Utils = {
        // Each |taskFn| will have the errorResponse appended to
        // its arguments, and when called, it will stop the task.
        Loop: function (delay, taskFn, optParameters) {
            var taskInterval = null;

            // Response for the Task
            var errorResponse = function () {
                clearInterval(taskInterval);
            };

            // Prepare the Task Payload parameter
            var taskFnParameters = [];
            if (optParameters) {
                taskFnParameters.push(optParameters);
            }
            taskFnParameters.push(errorResponse);

            // Interval task which we will track the responses
            // and manage the state of this task.
            var task = function () {
                taskFn.apply(this, taskFnParameters);
            };

            taskInterval = setInterval(task, delay);
            task();
        },

        Series: function (delay, listParameters, taskFn, seriesCallback) {
            var seriesResponses = [];
            var i = 0;

            var callNextTask = function () {
                if (i > listParameters.length) {
                    seriesCallback(seriesResponses);
                    return;
                }
                
                var parameter = listParameters[i++];
                taskFn(parameter, function (taskStatus) {
                    seriesResponses.push(taskStatus);
                    setTimeout(callNextTask, delay);
                });
            }

            callNextTask();
        }
    };

    var OkCupidTasks = {
        crawlUsers: function (errorResponse) {
            OkCupidStorage.id++;
            console.log(OkCupidStorage.id + '::TASK::crawlUsers');
            OkCupidAPI.fetchUsers(function (resp) {
                console.log(OkCupidStorage.id + '::API::fetchUsers');
                if (resp.error) {
                    console.error(resp.error);
                }
                else {
                    Utils.Series(5000, resp, OkCupidAPI.fetchQuestions, function (questionsResp) {
                        console.log(OkCupidStorage.id + '::API::fetchQuestions');
                        // Filter the questions that are not valid.
                        var questions = questionsResp.filter(function (question) {
                            var isValid = !question.error && !question.skip;
                            if (!isValid) {
                                console.log(OkCupidStorage.id + '::API::fetchQuestions::Invalid', question);
                            }
                            return isValid;
                        });

                        // Store the valid questions.
                        OkCupidAPI.storeQuestions(questions, function (storeCallback) {
                            if (storeCallback.error) {
                                console.error(storeCallback.error)
                            }
                            console.log(OkCupidStorage.id + '::API::storeQuestions', storeCallback);
                        });
                    });
                }
            });
        }
    };

    // Start crawling users every 10 seconds.
    Utils.Loop(60000, OkCupidTasks.crawlUsers);

    return OkCupidStorage.users;
})();
