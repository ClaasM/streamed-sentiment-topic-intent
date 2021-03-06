/**
 * Created by claasmeiners on 31/07/17.
 * The Main Dashboard controller.
 * Receives the updates from the backend and updates the results-object on the scope accordingly.
 */
'use strict';

angular.module('Dashboard')
    .controller('DashboardCtrl', function ($scope, $http) {
      // Colors used for topics
      $scope.colors = [
        "#ff9900",
        "#ff0000",
        "#ff3399",
        "#cc33ff",
        "#3366ff",
        "#00ccff",
        "#00ff99",
        "#66ff33",
        "#ffff00",
        "#99ccff"
      ];
      // Used to visualize what is currently happening
      $scope.isStreaming = false;
      $scope.isLoading = false;
      //The default selected stream
      $scope.selectedStream = 'public';
      //The default stream setting
      $scope.streamSettings = {
        'user': {
          type: 'user',
          _with: 'followings',
          replies: 'all',
          track: [],
          locations: []
        },
        'site': {
          type: 'site',
          _with: 'followings',
          replies: 'all',
          follow: []
        },
        'public': {
          type: 'public',
          'filter_level': 'none',
          follow: [],
          track: ['iphone'],
          locations: [],
          languages: ['en']
        },
        'sample': {
          type: 'sample',
          languages: ['en']

        },
        'retweet': {
          type: 'retweet'
        },
        'firehose': {
          type: 'firehose',
          count: 0
        }
      };

      // Number of tweets shown in the recent tweets-part and window size for the charts
      $scope.SLIDING_WINDOW = 200;

      $scope.timeseries = {
        sentiment: new TimeSeries(),
        topics: {},
        sentiment_by_topic: {}
      };

      //Initialize all charts
      //Set the width of the chart manually since the responsive option of smoothie chart doesnt work in current browsers
      var sentiment_chart = new SmoothieChart({minValue: 0, maxValue: 100});
      var sentiment_chart_element = document.getElementById("sentiment_chart");
      sentiment_chart_element.width = document.getElementById("sentiment-chart-container").offsetWidth;
      sentiment_chart.streamTo(sentiment_chart_element, 2000);

      var topics_chart = new SmoothieChart({minValue: 0, maxValue: 100});
      var topics_chart_element = document.getElementById("topics_chart");
      topics_chart_element.width = document.getElementById("topics-chart-container").offsetWidth;
      topics_chart.streamTo(topics_chart_element, 2000);

      var sentiment_by_topic_chart = new SmoothieChart({minValue: 0, maxValue: 100});
      var sentiment_by_topic_element = document.getElementById("sentiment_by_topic_chart");
      sentiment_by_topic_element.width = document.getElementById("sentiment-by-topic-chart-container").offsetWidth;
      sentiment_by_topic_chart.streamTo(sentiment_by_topic_element, 2000);

      sentiment_chart.addTimeSeries($scope.timeseries.sentiment, {
        strokeStyle: '#00ff00',
        fillStyle: 'rgba(0, 255, 0, 0.4)',
        lineWidth: 3
      });

      var socket = io();
      $scope.updateSettings = function () {
        socket.emit('dashboard.update-settings', $scope.streamSettings[$scope.selectedStream]);
        $scope.isLoading = true;
        $scope.isStreaming = false;
      };

      //Initialize the dashboard
      $scope.results = {data: []};
      // Overwrite the push function so we can use it as a fixed size queue
      $scope.results.data.push = function () {
        if (this.length >= $scope.SLIDING_WINDOW) {
          this.shift();
        }
        return Array.prototype.push.apply(this, arguments);
      };

      socket.on('dashboard.update-success', function () {
        //This is emitted by the server if the update was successful
        $scope.isStreaming = true;
        $scope.isLoading = false;
      });

      //Called whenever a set of new tweets arrives via the stream, is analyzed and then sent to the client
      socket.on('dashboard.update', function (new_data) {

        console.log(new_data.length);

        //Add the data to the FIFO queue
        _.forEach(new_data, function (data) {
          $scope.results.data.push(data);
        });

        // Update result scores
        $scope.results.sentiment = {
          positive: 0,
          neutral: 0,
          negative: 0,
          irrelevant: 0
        };
        $scope.results.topics = {};
        $scope.results.sentiment_by_topic = {};

        _.forEach($scope.results.data, function (data) {

          // Increase the correct sentiment score
          $scope.results.sentiment[data.sentiment] += 100 / $scope.results.data.length;

          // Compute the topics probabilities
          _.forEach(data.topics, function (value, topic_id) {
            if ($scope.results.topics[topic_id]) {
              $scope.results.topics[topic_id].probability += (value.probability * 100 / $scope.results.data.length)
            } else {
              $scope.results.topics[topic_id] = {
                terms: value.terms,
                probability: (value.probability * 100 / $scope.results.data.length)
              }
            }
          });

          // Compute sentiment by topic
          _.forEach(data.topics, function (value, topic_id) {
            if (!$scope.results.sentiment_by_topic[topic_id]) {
              $scope.results.sentiment_by_topic[topic_id] = {
                positive: 0,
                negative: 0,
                neutral: 0,
                irrelevant: 0
              }
            }
            $scope.results.sentiment_by_topic[topic_id][data.sentiment] += (value.probability * 100 / $scope.results.data.length);
          });
        });

        // Compute the values for the sentiment chart
        $scope.timeseries.sentiment.append(new Date().getTime(),
            $scope.results.sentiment.positive / ($scope.results.sentiment.negative + $scope.results.sentiment.positive) * 100);

        // Compute the values for the topics chart
        _.forEach($scope.results.topics, function (topic, topic_id) {
          // Check if the topic already has a timeseries
          if (!$scope.timeseries.topics[topic_id]) {
            //No -> Attach new timeseries to value chart
            $scope.timeseries.topics[topic_id] = new TimeSeries();
            topics_chart.addTimeSeries($scope.timeseries.topics[topic_id], {
              strokeStyle: $scope.colors[topic_id],
              lineWidth: 3
            })
          }
          // Add the next value to the Timeseries
          $scope.timeseries.topics[topic_id].append(new Date().getTime(), topic.probability);
        });

        // Compute the values for the sentiment by topic chart
        _.forEach($scope.results.sentiment_by_topic, function (topic, topic_id) {
          //Compute the next sentiment value for this topic
          var value = Math.round(topic.positive / (topic.positive + topic.negative) * 100) || 0;
          // Check if the topic already has a timeseries
          if (!$scope.timeseries.sentiment_by_topic[topic_id]) {
            //No -> Attach new timeseries to value chart
            $scope.timeseries.sentiment_by_topic[topic_id] = new TimeSeries();
            sentiment_by_topic_chart.addTimeSeries($scope.timeseries.sentiment_by_topic[topic_id], {
              strokeStyle: $scope.colors[topic_id],
              lineWidth: 3
            })
          }
          // Add the next value to the Timeseries
          $scope.timeseries.sentiment_by_topic[topic_id].append(new Date().getTime(), value);
        });

        //Perform a angular digest so that the changes are represented in the DOM
        $scope.$digest()
      });
    });