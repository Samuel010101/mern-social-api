'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var FollowSchema = Schema({
  user: { type: Schema.ObjectId, ref: 'User' },
  followed: { type: Schema.ObjectId, ref: 'User' },
});

export default mongoose.model('Follow', FollowSchema);
