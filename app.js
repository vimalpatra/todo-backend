const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");

const {
  mongoose
} = require("./db/mongoose");

const bodyParser = require("body-parser");

/**
 * Load in the Mongoose models
 **/
const {
  List,
  Task,
  User
} = require("./db/models");


/* MIDDLEWARE */
// load middleware
app.use(bodyParser.json());

// CORS HEADERS MIDDLEWARE
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");

  res.header(
    'Access-Control-Expose-Headers',
    'x-access-token, x-refresh-token'
  );

  next();
});


// check whether the request has a valid JWT access token
let authenticate = (req, res, next) => {
  let token = req.header('x-access-token');

  console.log('token', token);
  console.log('User.getJWTSecret()', User.getJWTSecret());
  // return;
  // verify the JWT
  jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
    if (err) {
      // there was an error
      // jwt is invalid - * DO NOT AUTHENTICATE *
      // console.log('error', err);
      res.status(401).send(err);
    } else {
      // jwt is valid
      req.user_id = decoded._id;
      next();
    }
  });
}


// Verify Refresh Token Middleware (to verify the session)
let verifySession = (req, res, next) => {
  // grab the refresh token from the request header
  let refreshToken = req.header('x-refresh-token');
  // grab the _id from the request header
  let _id = req.header('_id');

  User.findByIdAndToken(_id, refreshToken).then((user) => {
    if (!user) {
      // user couldn't be found
      return Promise.reject({
        'error': 'User not found. Make sure that the refresh token and user id are correct'
      });
    }


    // if the code reaches here - the user was found and the refresh token is in the database 
    // But we still have to check if it has expired or not
    req.user_id = user._id;
    req.userObject = user;
    req.refreshToken = refreshToken;

    let isSessionValid = false;

    user.sessions.forEach((session) => {
      if (session.token === refreshToken) {
        console.log('refresh token expired?', User.hasRefreshTokenExpired(session.expiresAt));
        // check if the session has expired
        if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
          // refresh token has not expired
          isSessionValid = true;
        }
      }
    });

    if (isSessionValid) {
      // the session is VALID - call next() to continue with processing this web request
      next();
    } else {
      // the session is not valid
      return Promise.reject({
        'error': 'Refresh token has expired or the session is invalid'
      })
    }

  }).catch((e) => {
    res.status(401).send(e);
  })
}

/* END MIDDLEWARE  */



/**
 * Route Handlers
 **/

app.get("/", (req, res) => {
  res.send("Some Response on /");
});



// List Routes

/**
 * GET /lists
 * Purpose: Get all lists
 */
app.get("/lists", authenticate, (req, res) => {
  console.log('get lists', req);
  // We want to return an array of all the lists that belong to the authenticated user
  List.find({
    _userId: req.user_id
  }).then((lists) => {
    res.send(lists);
  }).catch((e) => {
    res.send(e);
  });
});

/**
 * POST /lists
 * Purpose: Create a list
 */
app.post("/lists", authenticate, (req, res) => {
  // Create a new list in the database and return a response back including it's 'id' to the user
  // The list data will be passed in the JSON request's body
  let title = req.body.title;

  let newList = new List({
    title,
    _userId: req.user_id
  });

  newList.save().then(listDoc => {
    // return the list document created (including id)
    res.send(listDoc);
  }).catch(e => {
    res.status(400).send(e);
  });
});

/**
 * PATCH /lists/:id
 * Purpose: Update a specific list
 */
app.patch("/lists/:id", authenticate, (req, res) => {
  // Update a specific list (id specified in the URL) with the new values sent through the JSON body of the request
  List.findOneAndUpdate({
    _id: req.params.id,
    _userId: req.user_id
  }, {
    $set: req.body
  }).then(() => {
    res.send({
      'message': 'updated successfully'
    });
  });
});

/**
 * DELETE /lists/:id
 * Purpose: Delete a specific list
 */
app.delete("/lists/:id", authenticate, (req, res) => {
  // Delete a specific list (id specified in the URL)
  List.findOneAndRemove({
    _id: req.params.id,
    _userId: req.user_id
  }).then(removedListDoc => {
    res.send({
      'message': 'removed successfully',
      removedListDoc
    });

    // delete all the tasks that are in the deleted list
    deleteTasksFromList(removedListDoc._id);
  });
});


// Task Routes

/**
 * GET /lists/:listId/tasks
 * Purpose: Get all tasks in a specific list
 */
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
  console.log('get tasks', req);
  // We want to return all tasks that belong to a specific list (specified by listId)
  Task.find({
    _listId: req.params.listId
  }).then((tasks) => {
    res.send(tasks);
  })
});


/**
 * POST /lists/:listId/tasks
 * Purpose: Create a new task in a specific list
 */
app.post('/lists/:listId/tasks', authenticate, (req, res) => {
  // We want to create a new task in a list specified by listId

  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id
  }).then((list) => {
    if (list) {
      // list object with the specified conditions was found
      // therefore the currently authenticated user can create new tasks
      return true;
    }

    // else - the list object is undefined
    return false;
  }).then((canCreateTask) => {
    if (canCreateTask) {
      let newTask = new Task({
        title: req.body.title,
        _listId: req.params.listId
      });
      newTask.save().then((newTaskDoc) => {
        res.send(newTaskDoc);
      });
    } else {
      res.sendStatus(404);
    }
  });
})

/**
 * PATCH /lists/:listId/tasks/:taskId
 * Purpose: Update an existing task
 */
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
  // We want to update an existing task (specified by taskId)

  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id
  }).then((list) => {
    if (list) {
      // list object with the specified conditions was found
      // therefore the currently authenticated user can make updates to tasks within this list
      return true;
    }

    // else - the list object is undefined
    return false;
  }).then((canUpdateTasks) => {
    if (canUpdateTasks) {
      // the currently authenticated user can update tasks
      Task.findOneAndUpdate({
        _id: req.params.taskId,
        _listId: req.params.listId
      }, {
        $set: req.body
      }).then(() => {
        res.send({
          message: 'Updated successfully.'
        })
      })
    } else {
      res.sendStatus(404);
    }
  })
});

/**
 * DELETE /lists/:listId/tasks/:taskId
 * Purpose: Delete a task
 */
app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {

  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id
  }).then((list) => {
    if (list) {
      // list object with the specified conditions was found
      // therefore the currently authenticated user can make updates to tasks within this list
      return true;
    }

    // else - the list object is undefined
    return false;
  }).then((canDeleteTasks) => {

    if (canDeleteTasks) {
      Task.findOneAndRemove({
        _id: req.params.taskId,
        _listId: req.params.listId
      }).then((removedTaskDoc) => {
        res.send(removedTaskDoc);
      })
    } else {
      res.sendStatus(404);
    }
  });
});


/* USER ROUTES */

/**
 * POST /users/signup
 * Purpose: Sign Up
 */

app.post('/users/signup', (req, res) => {
  let body = req.body;
  let newUser = new User(body);

  newUser.save().then(() => newUser.createSession()).then(refreshToken => {
    // session created successfully and refreshToken retrieved.
    return newUser.generateAccessAuthToken().then(accessToken => {
      // access auth token generated successfully, now we return an object containing the auth tokens
      return {
        accessToken,
        refreshToken
      }
    });

  }).then(authTokens => {
    // Now send the response back to the user with the tokens in the header and the user object in the body
    res
      .header('x-refresh-token', authTokens.refreshToken)
      .header('x-access-token', authTokens.accessToken)
      .send(newUser);
  }).catch(e => {
    res.status(400).send(e);
  });

});


/**
 * POST /users/login
 * Purpose: Log In
 */

app.post('/users/login', (req, res) => {
  let email = req.body.email;
  let password = req.body.password;

  User.findByCredentials(email, password).then(user => {
    return user.createSession()
      .then(refreshToken => {
        // session created successfully and refreshToken retrieved.
        // access auth token generated successfully, now we return an object containing the auth tokens
        return user.generateAccessAuthToken().then(accessToken => {
          return {
            accessToken,
            refreshToken
          }
        })
      }).then(authTokens => {
        // Now send the response back to the user with the tokens in the header and the user object in the body
        res
          .header('x-refresh-token', authTokens.refreshToken)
          .header('x-access-token', authTokens.accessToken)
          .send(user);
      });

  }).catch(e => {
    console.log('error', e);
    res.status(400).send(e);
  });

});


/**
 * GET /users/me/access-token
 * Purpose: generates and returns an access token
 */
app.get('/users/me/access-token', verifySession, (req, res) => {
  // we know that the user is authenticated and we have the user_id and userObject available to us
  req.userObject.generateAccessAuthToken().then((accessToken) => {
    res.header('x-access-token', accessToken).send({
      accessToken
    });
  }).catch((e) => {
    res.status(400).send(e);
  });
})



/**
 * HELPER METHODS
 *  */

let deleteTasksFromList = (_listId) => {
  Task.deleteMany({
    _listId
  }).then(() => {
    console.log("Tasks from " + _listId + " were deleted!");
  })
}



// Serve App

app.listen(3000, () => {
  console.log("Server is listening on port 3000");
});