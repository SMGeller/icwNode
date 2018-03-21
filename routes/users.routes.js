'use strict';

/* Import dependecies */
const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const expressValidator = require('express-validator');

var router = express.Router();
router.use(expressValidator());

/* Import User Schema */
var User = require('../models/User.model.js');

// Register User
router.post('/register', (req, res) => {

  // Parse POST request
  var firstName = req.body.firstName;
  var lastName = req.body.lastName;
  var email = req.body.email;
  var username = req.body.username;
  var password = req.body.password;
  var confirm = req.body.confirm;
  var isAdmin = req.body.isAdmin;

  // Validation through express-validator
  req.checkBody('firstName', 'First name is required').notEmpty();
  req.checkBody('lastName', 'Last name is required').notEmpty();
  req.checkBody('email', 'Email is not valid').isEmail();
  req.checkBody('username', 'Username is required').notEmpty();
  req.checkBody('password', 'Password is required').notEmpty();
  req.checkBody('confirm', 'Passwords do not match').equals(req.body.password);

  // Find any errors using express-validator
  var errors = req.validationErrors();

  // Log errors on server console and client browser
  if (errors) {
    console.log("Errors found in registering new user");
    var error_message = '';
    for(var i = 0; i < errors.length; i++){
      error_message = error_message + (errors[i]["msg"] + ", ");
    }
    res.send(error_message);
  }
  // No errors - Proceed with new user creation
  else {
    var newUser = new User({
      firstName: firstName,
      lastName: lastName,
      email: email,
      username: username,
      password: password,
      isAdmin: isAdmin
    });

    User.createUser(newUser, function(err, user) {
          if(err) throw err;
    });

    res.send(`New user successfully added!\n${newUser}`);
  }
});

// Passport Strategy for when users log in
passport.use(new LocalStrategy(
  function(username, password, done) {
      User.getUserByUsername(username, (err, user) => {
        if (err) throw err;
        if(!user){
          return done(null, false, {message: 'Unknown User'});
        }
        User.comparePassword(password, user.password, (err, isMatch) => {
          if (err) throw err;
          if (isMatch){
            return done(null, user);
          } else {
            return done(null, false, {message: 'Invalid password'});
          }
        });
      });
}));

// Post request for users to log in
router.post('/login',
  passport.authenticate('local', {successRedirect:'/', failureRedirect:'/users/login', failureFlash: true}),
  function(req, res) {
    // If this function gets called, authentication was successful.
    // `req.user` contains the authenticated user.
  });

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.getUserById(id, function(err, user) {
    done(err, user);
  });
});

// Logout using Passport
router.get('/logout', (req, res) => {
  req.logout();
  res.send('You have been logged out');
});

module.exports = router;
