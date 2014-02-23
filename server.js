//Todo: querystring doesn't support nested objects.  Use qs instead.  npm install qs.
//Still use the stringify method

//Todo Consider Needle and Restler
var express = require('express'),
    app = express(),
    http = require("http"),
    https = require('https'),
    querystring = require('querystring'),
    _ = require('underscore'),
    async = require('async'),
    config = require('./lib/config'),
    fs = require('fs'),
    needle = require('needle');
    
console.log("working directory is " + process.cwd())

//Using https config here is a combination of code mostly taken from http://stackoverflow.com/questions/11744975/enabling-https-on-express-js, but
// but with a bit nicer coding of the credentials objects as shown rom Node js in Action, p. 95
//The files should be properites, and note that this is diffenent in cloud9 than on my computer!!
var credentials = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('key-cert.pem')
};
var httpServer = http.createServer(app)
var httpsServer = https.createServer(credentials, app)
//NOT SURE WE STRICLTY NEED TO have LinkedIn redirect to our https for authentication.  Might get away with http!!


//TODO: IMPORTANT!! CALCULATE PROTOCOL AND HOSTNAME!! FROM the request.  When it's hard coded it means we can only deploy to one location!!!
//!!!!When this is https then we should accept https at the bottom
var linkedInAuthRedirectURL = 'http://auth-node.herokuapp.com//linkedin/auth/redirect/accept'


//app.use(express.logger());
//app.use(express.cookieParser())
//Satish B on http://www.youtube.com/watch?v=vmDCakoxdwY says put cookieParser before session and have some secret. Is it strong enough?
//app.use(express.session({secret: config.session-secret}))
//I've seen this: app.use(express.session({ store: mongoStore({url:app.set('db-uri')}), secret: 'topsecret'  in  http://stackoverflow.com/questions/5343131/session-secret-what-is-it

//All this from http://stackoverflow.com/questions/18617091/secret-option-required-for-app-useexpress-cookiesession, but
//session secret was passed in as an env variable, and maxAge was 31 days =  2678400 seconds
/*app.use(express.compress());
app.use(express.bodyParser());
app.use(express.cookieParser());
//
app.use(express.cookieSession({
    key: "mysite.sid.uid.whatever",
    secret: config.session-secret,
    cookie: {
        maxAge: 50
    }
}));*/


app.use(express.cookieParser(config.session_secret));
app.use(express.session());
//@@@@@@@@@@@@@@
//!!!Using express with http://stackoverflow.com/questions/11744975/enabling-https-on-express-js
//Note that although 443 is the default port for HTTPS, during development you probably want to use something like 8443 because most systems don't allow non-root listeners on low-numbered ports
//But will LinkedIn now to go to a port other than 443, or does https:whatever automatically pick the correct port, or do I need to put the port in my redirect?
//@@@@@@@@@@@@@@

app.get('/', function(req, res) {
    res.send('<a href="/login">hello</a>');
});



//---->  req.params is for params in the url path, as in toot/users/someId.  !!!params.query.id!!! is for root/users/id=?
//var registrationMap = {}
app.get('/login', function(req, res){
    console.log('login name is ' + req.query.name)
    req.session.name=req.query.name
    req.session.registrationState = makeId(12)
    console.log(req.session.registrationState)
    console.log('session name is ' + req.session.name)
    res.redirect("https://www.linkedin.com/uas/oauth2/authorization?" + querystring.stringify({
        'response_type':  'code',
        'client_id':config.api_key,
        'scope': 'r_fullprofile r_emailaddress rw_nus r_network r_contactinfo' ,
        'state': req.session.registrationState,
        'redirect_uri': linkedInAuthRedirectURL
    }))
    //res.send('<a href="/view/session">hello</a>')
    //console.log("leaving method")
    //I saw this come up:
    //https://demo-project-c9-groovyflow.c9.io/linkedin/auth/redirect/accept?code=AQQU6EnINZqaJXdzDGZI5HqiIzpiD1I45NBqN82HcjCgkhybqgle-4wrvQOu-HUk3YXHZdAVFJLG4I6wk0yAJbKJVKKoSDCQQY-Du-Y7HmQVafDjCI0&state=xfxxfvvv
    //That is indeed what LinkedIn should send us back, but why didn't I see LinkedIn asking the browser to accept or cancel?
    //In Tim's version (http://yournextstep.my.phpcloud.com/ynspoc/) LinkedIn asks me to sign into LinkedIn and allow access, and then sends me back to:
    //http://yournextstep.my.phpcloud.com/ynspoc/index.php?code=AQQ3evJBLWOhZT_-aqm9FJBC3D1kREOaFi_z3Q0Qq89uLfqHtlsI2PyHy3WUO39QeDHB1-DwPp6HZgBB7G44DlQXQ6W3fBgSx3s73zu-1k0rRQOlXro&state=52e92405a856e2.78704666
})

//TODO Not able to save auth info in session for some reason, so temporarily saving it here to see if authCode acutally works
//var authSaved = "";
app.get('/linkedin/auth/redirect/accept', function(req, res){
    //TODO: Save this info!  And check that the state is one that we expected.  Should be able to tell
    //from session?  Or from data we keep about recent states, although that doesn't sound as safe.
    console.log("linked in redirect code is " + req.query.code + ' for session with username ' + req.session.name)
    console.log("linked in redirect state is " + req.query.state)
    console.log("linked in redirect error is " + req.query.error)
    console.log("linked in redirect error description is " + req.query.error_description)
    //Now getting: unauthorized_client; error_description: the client is not authorized
    
    if(req.query.state != req.session.registrationState){
        res.send('LinkedIn passed back a state variable that is different from the one we created for you. We expect a CSRF attack' )
        return;
    }
    else if(req.query.error === 'access_denied'){
         res.send("We're sorry you decided not to give YourNextStep access to your LinkedIn account")
         return;
    }
    //Possibility of some other req.query.error?
    else{
        console.log("registration state is what we expected. query/session: " + req.query.state + "/" + req.session.registrationState)
    }
    
    var queryStringToGetAccessTokenForAuthorizationCode = querystring.stringify({
       'grant_type' :'authorization_code',
       'code':req.query.code, 
       'redirect_uri': linkedInAuthRedirectURL,
        'client_id':config.api_key,
        'client_secret':config.secret_key
    })
    console.log("queryStringToGetAccessTokenForAuthorizationCode is " + queryStringToGetAccessTokenForAuthorizationCode)
    needle.post("https://www.linkedin.com/uas/oauth2/accessToken", queryStringToGetAccessTokenForAuthorizationCode, 
    function(err, response, body){
            console.log('expires_in: ' + body.expires_in)
            //TODO Associate this access token with the user.  We have a session by this point!
            console.log('access_token', body.access_token)        
            
            console.log("err: " + objToString(err))
            //console.log('response: ' + objToString(response))
            console.log('body: ' + objToString(body))
     
     

            req.session.access_token = body.access_token
            //authSaved = body.access_token
            console.log("Did we save token to session? Token on session is " + req.session.access_token )
            linkedInProfile(body.access_token, function(err, json){
                res.send('Hello ' + json.firstName + " " + json.lastName + ". Thanks for giving LinkedIn access to YourNextStep")
            })            
            

            
    })


    
    //res.redirect('/directions')
})

function objToString(object) {
    var output= '';
    for (property in object) {
      output += property + ': ' + object[property]+'; ';  
    }
    return output;
}

function makeId(n)
{
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < n; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

app.get('/view/session', function(req, res) {
    res.send("Your session reveals that your name is " + req.session.name)
})

var url = "http://maps.googleapis.com/maps/api/directions/json?origin=Central Park&destination=Empire State Building&sensor=false&mode=walking";
app.get('/directions', function(req, userResponse) {
    http.get(url, function(response) {

        // data is streamed in chunks from the server
        // so we have to handle the "data" event    
        userResponse.writeHead(200);
        response.on("data", function(chunk) {
            userResponse.write(chunk.toString());
        });

        response.on("end", function(err) {
            userResponse.end();
        });
    });
});

app.get('/distance', function(request, userResponse) {
    console.log('!!!!testing querystring: ' + querystring.stringify({
        query: "SELECT name FROM user WHERE uid = me()"
    }));
    http.get(url, function(response) {

        var buffer = "";

        userResponse.writeHead(200);
        response.on("data", function(chunk) {
            buffer = buffer + chunk.toString();
        });

        response.on("end", function(err) {
            var data = JSON.parse(buffer);
            userResponse.end(data.routes[0].legs[0].distance.text);
        });
    });
});

//Gets same error as people-search
//Line 129 of nds.js shows that we're trying to do a domain search where domain is maps.googleapis.com.
//I think that's not something that a DNS can find!  At least it fails when I try it in the browser.
//Same problem with the linkedIn api host.  The json api is not the same as the domain name!
//That line is actually:   var wrap = cares.getaddrinfo(domain, family);
app.get('/distance2', function(request, userResponse) {

    var options = {
        hostname:'maps.googleapis.com',
        path: '/maps/api/directions/json' + '?' + querystring.stringify({
            'origin': 'Central Park',
            'destination':'Empire State Building',
            'sensor':false,
            'mode':'walking'
        }),
        method:'GET',
        port: 80


    }
    console.log('url is ' + options['host'] + options['path'])
    http.get(options, function(response) {

        var buffer = "";

        userResponse.writeHead(200);
        response.on("data", function(chunk) {
            buffer = buffer + chunk.toString();
        });

        response.on("end", function(err) {
            var data = JSON.parse(buffer);
            userResponse.end(data.routes[0].legs[0].distance.text);
        });
    });
});


//var oAuth2Token = 'AQWyLWeKkpuay6mYjsyHgQ-ip51xa77VaO-wzybZRZvO9xcStgj2sMlw5qK2zAeLN8S1VP65H2FyYZ-n0YVWfPXkiq2wfU-RGLbLIQeQcN79Mgfvn6xlJERKQCs1qMuYM6YNh1y9h3SCZyNNO6_l9u9hrPmupkStJQGfstRI6Ko1quej7DA'
var oAuth2Token = 'AQW02ZU6K0k4I4hK_ant9qGPcOgMxG8paozCV1pFdHqH5TIK3S-Z-TgzPRXnu625wbz-weGqZyUT4itz0S72iNGRSvlDHYOSMmritxDnVw37WLdfPBoEOkVlFnz9m_7XQhKDebqO3JLbW2xtUW6glMiZmeofyLfGbhhw-HDwJIbXFIHnnuU';
//var oAuth2Token = 'AQVFyNKpL5N7ubRiCI5x2ToIlDS00WuvwmghGXLPPbrmrzN7K1Z3sp5YmX2RA0Uk3GpgYTKrhqJgoArHIh1HEYbTf1XEAZ9V7LXC-qMN3LInUqno0VboUzQ2xtUQpDJOcQDoBYrkL14mRe5u6x_djipwabzOHFRtDRG1uxk_wESgVxIGdhQ'
app.get('/people-search', function(request, response) {
    var query = {
        'sort': 'connections',
        'oauth2_access_token': request.session.access_token,
        'start': 0,
        'count': 5
    };

    linkedInJson('/v1/people-search', query, function(err, json){
        //No need to do response.writeHead(200) when using Express's json function, which Express has added to response
        //response.writeHead(200);
        response.json(200, _.map(json.people.values, function(person){ return person.firstName + " " + person.lastName} ))
    })

});

app.get('/people-search-all', function(request, response){

    allLinkedInIConnections(oAuth2Token, function(err, values){
        response.json(200, _.map(values, function(person){ return person.firstName + " " + person.lastName} ))
    })
})

//!Only call this after you've authenticated with LinkedIn.
app.get('/profile', function(request, response){
    //console.log("authToken for LinkedIn profile request is " + request.session.access_token + " for user with name " + req.session.name)
    linkedInProfile(request.session.access_token  , function(err, json){
        response.writeHead(200)
        response.end('Hello ' + json.firstName + " " + json.lastName)
    })

});

//@@@Attempting reusable code@@@
//Immediate goals: Use underscore and return json.
//Use node's async module to read in all people in people search, and, separately, to combine people and profile in parallel
//Put some reusable code into a module
//Don't forget the LinkedIn authentication stuff.  Are we ready to attempt that?
//gitub and cloud9 getting code from github

function allLinkedInIConnections(oAuthToken, fn) {
    var maxNumLinkedInWillSendBack = config.max_records_linked_in;
    function jsonToPeopleValues(json) {
        return json.people.values
    }

    var query = {
        'sort': 'connections',
        'oauth2_access_token': oAuth2Token,
        'count': maxNumLinkedInWillSendBack,
        'start': 0
    };

    linkedInJson('/v1/people-search', query, function (err, json) {
        if (err) return fn(err)
        if (json.people._count >= json.people._total) return fn(err, jsonToPeopleValues(json))
        //Currently not trying to order these!
        var jsonChunks = [json]

        //var callbacks = [makePeopleSearchCallback(oAuthToken, 26, maxNumLinkedInWillSendBack, jsonChunks), makePeopleSearchCallback(oAuthToken, 51, maxNumLinkedInWillSendBack, jsonChunks)]
        async.parallel(makeAllPeopleSearchCallbacks(oAuthToken, maxNumLinkedInWillSendBack, maxNumLinkedInWillSendBack, jsonChunks, json.people._total ), function (err) {
            if (err)
                fn(err)
            else {
                console.log("in final callback, json chunks size is " + jsonChunks.length)
                var allValues = _.flatten(_.map(jsonChunks.sort(function(a,b){a.people._start - b.people._start}), jsonToPeopleValues ))
                fn(err, allValues)
            }
        })

    })

}

function makeAllPeopleSearchCallbacks(oAuthToken, start, count, jsonChunks, max) {
    var callbacks = []
    while(start < max) {
        callbacks.push(makePeopleSearchCallback(oAuthToken, start, count, jsonChunks))
        start += count
    }
    return callbacks;
}

function makePeopleSearchCallback(oAuthToken, start, count, jsonChunks) {
    return function (callback) {
        var aQuery = {
            'sort': 'connections',
            'oauth2_access_token': oAuth2Token,
            'start': start,
            'count': count
        };
        linkedInJson('/v1/people-search', aQuery, function (err, json) {
            if (err)
                callback(err)
            else {
                jsonChunks.push(json)
                callback()
            }
        })

    }
}



function linkedInProfile(oauthToken, fn) {
    console.log('Searching for profile for oauthToken ' + oauthToken)
    var query = {
        'oauth2_access_token': oAuth2Token
    };
    linkedInJson('/v1/people/~', query, fn)
}


function linkedInJson(path, queryobj, fn) {
    //todo: Don't stringify if the query is already a String!!
    //Also handle case where there is no query!
    var options = {
        //!!!!very important!!!!  The hostname cannot include the protocol https, or the dns lookup that node does will fail!!
        //todo: For testing purposes we'll need this to be overridable!  Maybe an environment variable?
        hostname: 'api.linkedin.com',
        path: path + '?' + querystring.stringify(queryobj),
        headers: {
            'User-Agent': 'Mozilla/5.0 Ubuntu/8.10 Firefox/3.0.4',
            'x-li-format': 'json'
        }
    };
    https.get(options, function(response) {
        collect(response, fn)
    });
}

function collect(response, fn){
    var buffer = "";
    response.on("data", function(chunk) {
       console.log(chunk.toString())
        buffer = buffer + chunk.toString();
    });
    response.on("end", function(err) {
        var data = JSON.parse(buffer);
        //todo  Can't we tell if parsing failed and call error in that case?
        fn(err, data)
    });
}

//app.listen(process.env.PORT);     <---That's how we'd do it if we were only using http and not https
//Again from from http://stackoverflow.com/questions/11744975/enabling-https-on-express-js, the best thing to do is this:
//httpServer.listen(process.env.PORT);
//Todo: Port should be configured
//httpsServer.listen(8443)

//But cloud9 only gives us one port, so let's do this:
//HEY!! Tried httpsServer, but when I do that I can't hit our node server.  
//Seems like we can direct https here and have it succeed, even though we're not actually using any certificat
//when we do this!!
httpServer.listen(process.env.PORT, process.env.IP);


console.log('Express server started on port %s', process.env.PORT);
