/**
 * Created by claasmeiners on 31/07/17.
 */
'use strict';

angular.module('Dashboard')
    .controller('MainCtrl', function ($scope) {
      $scope.login = function () {
        console.log("Login called")
      }
    });