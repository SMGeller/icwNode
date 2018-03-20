'use strict';

/* Module dependencies */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt');

/* A Validation function for local strategy password */
var validateLocalStrategyPassword = function(password) {
	return (this.provider !== 'local' || (password && password.length > 6));
};

/* User Schema */
var UserSchema = new Schema({
	firstName: {
		type: String,
		trim: true,
		default: '',
	},
	lastName: {
		type: String,
		trim: true,
		default: '',
	},
	displayName: {
		type: String,
		trim: true
	},
	email: {
		type: String,
		trim: true,
		default: '',
	},
	username: {
		type: String,
		unique: 'Username already exists',
		required: 'Please fill in a username',
		trim: true
	},
	password: {
		type: String,
		default: '',
		validate: [validateLocalStrategyPassword, 'Password must be at least seven characters']
	},
	confirm: {
			type: String,
			default: ''
	},
	roles: {
		type: [{
			type: String,
			enum: ['user', 'admin']
		}],
		default: ['admin']
	},
	isAdmin: {
		type: Boolean
	},
	updated: {
		type: Date
	},
	created: {
		type: Date,
		default: Date.now
	},
	/* For reset password */
	resetPasswordToken: {
		type: String
	},
	resetPasswordExpires: {
		type: Date
	}
});

var User = module.exports = mongoose.model('User', UserSchema);

 module.exports.createUser = function(newUser, callback){
   bcrypt.genSalt(10, function(err, salt) {
     bcrypt.hash(newUser.password, salt, function(err, hash) {
         newUser.password = hash;
         newUser.save(callback);
     });
   });
 }

 module.exports.getUserByUsername = function(username, callback) {
   var query = {username: username};
   User.findOne(query, callback);
 }

 module.exports.getUserById = function(id, callback) {
  User.findById(id, callback);
}

module.exports.comparePassword = function(candidatePassword, hash, callback) {
  bcrypt.compare(candidatePassword, hash, function(err, isMatch) {
      if(err) throw err;
      callback(null, isMatch);
  });
}
