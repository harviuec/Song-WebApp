var crypto = require('crypto');
var mysql = require('mysql');
var moment = require('moment');
var _ = require('lodash');
var bcrypt = require('bcrypt');

let host = process.env.DB_HOST || 'localhost';
let port = process.env.DB_PORT || '3306';
let user = process.env.DB_USER || 'root';
let database = process.env.DB_NAME || 'project2';
let password = process.env.DB_PASSWORD || 'root';
var db = mysql.createConnection({
    host: host,
    user: user,
    password: password,
    database: database
});

db.connect(function(err) {
    if (err) {
        console.error('error connecting: ' + err.stack);
        return;
    }

    console.log('connected as id ' + db.threadId);
});

exports.manualLogin = function(user, pass) {
    return new Promise((resolve, reject) => {
        var query = "Select * from User where `uid`=" + mysql.escape(user) + ";";
        db.query(query, (err, result) => {
            if (err) {
                reject('user-not-found');
            } else {
                if (result.length > 0) {
                    validatePassword(pass, result[0].pass, function(err, res) {
                        if (res) {
                            resolve(result);
                        } else {
                            reject('invalid-password');
                        }
                    });
                } else {
                    reject('user-not-found');
                }
            }
        });
    });
}

exports.addNewAccount = function(req) {
    return new Promise((resolve, reject) => {
        var salt = bcrypt.genSaltSync(10);
        var hash = bcrypt.hashSync(req.pass, salt);
        db.query('call new_user(?, ?, ?,?,?)', [req.user, req.name, hash, req.city, req.email], function(err, results) {
            if (err) {
                reject('username-taken');
            } else {
                resolve(results);
            }
        });
    });
}

exports.searchKeyword = function(keyword, userName) {
    return new Promise((resolve, reject) => {
        db.query('call SearchTracks(?, ?)', [keyword, userName], function(err, results) {
            if (err) {
                reject(err);
            } else {
                resolve(results[0]);
            }
        });
    });
}

exports.searchAlbumKeyword = function(keyword) {
    return new Promise((resolve, reject) => {
        var query = "select abid, abtitle from album where abtitle like concat('%'," + mysql.escape(keyword) + ",'%');";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });

}

exports.searchTrackKeyword = function(keyword) {
    return new Promise((resolve, reject) => {
        var query = "select sid, stitle from songs where stitle like concat('%'," + mysql.escape(keyword) + ",'%');";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.searchArtistKeyword = function(keyword) {
    return new Promise((resolve, reject) => {
        var query = "select aid, aname from artist where aname like concat('%'," + mysql.escape(keyword) + ",'%');";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });

}

exports.searchPlayListKeyword = function(keyword) {
    return new Promise((resolve, reject) => {
        var query = "select pid, ptitle from playlist where ptype = 'public' and ptitle like concat('%'," + mysql.escape(keyword) + ",'%');";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.searchPlays = function(key, keyVal, uid) {
    return new Promise((resolve, reject) => {
        var query = '';
        if (key == 'sid' || key == 'tid') {
            query = "select s.sid, s.stitle, s.sduration, a.aname, a.aid from songs s, artist a where s.aid = a.aid and s.sid=" + mysql.escape(keyVal);
        } else if (key == 'aid') {
            query = "select s.sid, s.stitle, s.sduration, a.aid, a.aname from songs s, artist a where s.aid = a.aid and a.aid=" + mysql.escape(keyVal);
        } else if (key == 'abid') {
            query = "select s.sid, s.stitle, s.sduration,ab.abid, ab.abtitle, a.aname, a.aid from songs s, Artist a, albumsong absg, album ab where ab.abid = absg.abid and absg.sid = s.sid and a.aid = s.aid and ab.abid=" + mysql.escape(keyVal);
        } else if (key == 'pid') {
            query = "select p.pid, s.sid, s.stitle, s.sduration, p.ptitle, a.aname, a.aid from playlist p, pltrack ps, songs s, artist a where a.aid = s.aid and s.sid = ps.sid and p.pid = ps.pid and p.ptype = 'public' and p.pid=" + mysql.escape(keyVal);
        } else if (key == 'pidc') {
            query = "select p.pid, s.sid, s.stitle, s.sduration, p.ptitle, a.aname, a.aid from playlist p, pltrack ps, songs s, artist a where a.aid = s.aid and s.sid = ps.sid and p.pid = ps.pid and p.pid=" + mysql.escape(keyVal);
        }
        query = "select t.*, r.rating from (" + query + ") as t left outer join (select sid,rating from rating r where uid=" + mysql.escape(uid) + ")as r on t.sid = r.sid;";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                var finalResult = {};
                finalResult.playData = result;
                if(key == 'aid'){
                    searchSimilarArtists(keyVal).then(res=>{
                        finalResult.similarData = res
                        resolve(finalResult)
                    }).catch(err=>{
                        reject(err);
                    });
                } else if (key == 'abid') {
                    searchSimilarAlbums(keyVal).then(res=>{
                        finalResult.similarData = res
                        resolve(finalResult)
                    }).catch(err=>{
                        reject(err);
                    });
                } else if (key == 'pid') {
                    searchSimilarPlaylist(keyVal).then(res=>{
                        finalResult.similarData = res
                        resolve(finalResult)
                    }).catch(err=>{
                        reject(err);
                    });
                } else {
                    resolve(finalResult);
                }
            }
        });
    });
}

function searchSimilarArtists(aid){
    return new Promise((resolve, reject) => {
        var query = `SELECT ades FROM ARTIST WHERE aid = `+mysql.escape(aid)+`;`;
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                result = JSON.stringify(result);
                result = JSON.parse(result);
                var artistTypes = result && result[0].ades;
                artistTypes = artistTypes && artistTypes.split(',').join('|');
                var query2 = `select * from Artist where aid !=`+ mysql.escape(aid) +` and ades REGEXP ` + mysql.escape(artistTypes) + `;`;
                db.query(query2, (err, results) =>{
                    if(err){
                        reject(err);
                    } else {
                        console.log(results);
                        resolve(results);
                    }
                });
            }
        });
    });
}

function searchSimilarPlaylist(pid){
    return new Promise((resolve, reject) => {
        var query = `SELECT distinct * FROM playlist p where uid in (Select uid from playlist where pid = `+mysql.escape(pid)+`);`;
        console.log(query)
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function searchSimilarAlbums(abid){
    return new Promise((resolve, reject) => {
        var query = `SELECT distinct ab.* FROM album ab, songs s, AlbumSong abms where ab.abid != `+mysql.escape(abid)+` and ab.abid = abms.abid and abms.sid = s.sid and s.sgenre in (SELECT s.sgenre FROM album ab, songs s, AlbumSong abms where ab.abid = abms.abid and abms.sid = s.sid and ab.abid = `+mysql.escape(abid)+`)`;
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}



exports.getPlayListKeyword = function(username) {
    return new Promise((resolve, reject) => {
        var query = "select pid,ptitle, ptype from playlist where uid = " + mysql.escape(username) + ";";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.deletePlayList = function(pid) {
    return new Promise((resolve, reject) => {
        var query = "delete from playlist where pid = " + mysql.escape(pid) + ";";
        console.log(query);
        db.query(query, (err, results) => {
            console.log(pid);
            if (err) {
                reject('delete-failed');
            } else {
                resolve(results);
            }
        });
    });
}

exports.addNewPlaylist = function(uid, name, type, Qtype, plid) {
    return new Promise((resolve, reject) => {
        if (Qtype == 'update') {
            console.log(plid);
            console.log(name);
            console.log(name);
            console.log(type);
            console.log(Qtype);
            db.query('call update_playlist(?,?, ?)', [plid, name, type], function(err, results) {
                if (err) {
                    reject('insert-failed');
                } else {
                    resolve(results);
                }
            });
        } else {
            db.query('call new_playlist(?,?, ?)', [uid, name, type], function(err, results) {
                if (err) {
                    reject('insert-failed');
                } else {
                    resolve(results);
                }
            });
        }
    });
}

exports.getMostRecentPlayList = function() {
    return new Promise((resolve, reject) => {
        var query = "select pid,ptitle, ptype from playlist where ptype = 'public' order by preldt desc LIMIT 5;";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.searchRecentAlbum = function() {
    return new Promise((resolve, reject) => {
        var query = "select abid, abtitle from album LIMIT 5;";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

var validatePassword = function(plainPass, hashedPass, callback) {
    bcrypt.compare(plainPass, hashedPass, function(err, ress) {
        if (ress) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    });
}

exports.addRating = function(uid, sid, rating) {
    return new Promise((resolve, reject) => {
        var query = "INSERT INTO rating (`uid`, `sid`, `rating`, `rdate`) VALUES(" + mysql.escape(uid) + ", " + mysql.escape(sid) + ", " + mysql.escape(rating) + ", NOW()) ON DUPLICATE KEY UPDATE rating=" + mysql.escape(rating) + ", rdate=NOW();";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.addArtistLikes = function(uid, aid) {
    return new Promise((resolve, reject) => {
        var query = "INSERT INTO Likes (`uid`, `aid`, `likedt`) VALUES(" + mysql.escape(uid) + ", " + mysql.escape(aid) + ", NOW()) ON DUPLICATE KEY UPDATE likedt=NOW();";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.deleteArtistLikes = function(uid, aid) {
    return new Promise((resolve, reject) => {
        var query = "DELETE FROM Likes WHERE uid=" + mysql.escape(uid) + " and aid=" + mysql.escape(aid) + ";";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.checkArtistLikes = function(uid, aid) {
    return new Promise((resolve, reject) => {
        var query = "select * from Likes where uid=" + mysql.escape(uid) + " and aid = " + mysql.escape(aid) + ";";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.checkUserFollow = function(uid, pid) {
    return new Promise((resolve, reject) => {
        var query1 = `Select uid from playlist where pid = ` + mysql.escape(pid) + `;`
        db.query(query1, (err, result) => {
            if (err) {
                reject(err);
            } else {
                var unamefollow = result[0].uid;
                if (unamefollow == uid) {
                    reject('same user');
                    return;
                }
                var query2 = `Select * from followers where uid =` + mysql.escape(uid) + ` and unamefollow = ` + mysql.escape(unamefollow) + `;`;
                db.query(query2, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            }
        });
    });
}

exports.adduserFollow = function(uid, pid) {
    return new Promise((resolve, reject) => {
        var query1 = `Select uid from playlist where pid = ` + mysql.escape(pid) + `;`
        db.query(query1, (err, result) => {
            if (err) {
                reject(err);
            } else {
                var unamefollow = result[0].uid;
                if (unamefollow == uid) {
                    reject('same user');
                    return;
                }
                var query = "INSERT INTO followers (`uid`, `unamefollow`, `followdt`) VALUES(" + mysql.escape(uid) + ", " + mysql.escape(unamefollow) + ", NOW()) ON DUPLICATE KEY UPDATE followdt=NOW();";
                db.query(query, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            }
        });
    });
}

exports.deleteUserFollow = function(uid, pid) {
    return new Promise((resolve, reject) => {
        var query1 = `Select uid from playlist where pid = ` + mysql.escape(pid) + `;`
        db.query(query1, (err, result) => {
            if (err) {
                reject(err);
            } else {
                var unamefollow = result[0].uid;
                if (unamefollow == uid) {
                    reject('same user');
                    return;
                }
                var query = "DELETE FROM followers WHERE uid=" + mysql.escape(uid) + " and unamefollow=" + mysql.escape(unamefollow) + ";";
                db.query(query, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            }
        });
    });
}

exports.getmyPl = function(uid) {
    return new Promise((resolve, reject) => {
        var query = "select pid,ptitle from playlist where uid = " + mysql.escape(uid) + ";";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.addmyPl = function(sid, pid, keyV) {
    return new Promise((resolve, reject) => {
        if (keyV == 'pidc') {
            var query = "Delete from pltrack where pid=" + mysql.escape(pid) + " and sid= " + mysql.escape(sid) + ";";
        } else {
            var query = "INSERT INTO pltrack (`pid`, `sid`, `snumber`) VALUES(" + mysql.escape(pid) + ", " + mysql.escape(sid) + ", " + mysql.escape(pid) + ");";
        }
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.addtoplay = function(uid,sid,pid,abid) {
    return new Promise((resolve, reject) => {
        if(pid == '' && abid == ''){
            var query = "INSERT INTO plays (`uid`, `sid`, `playstime`) VALUES(" + mysql.escape(uid) + ", " + mysql.escape(sid) + ", NOW());";
        }
        else if(abid == ''){
            var query = "INSERT INTO plays (`uid`, `pid`, `sid`, `playstime`) VALUES(" + mysql.escape(uid) + ", " + mysql.escape(pid) + ", " + mysql.escape(sid) + ", NOW());";
        }else if(pid == ''){
            var query = "INSERT INTO plays (`uid`, `sid`, `abid`, `playstime`) VALUES(" + mysql.escape(uid) + ", " + mysql.escape(sid) + ", " + mysql.escape(abid) + ", NOW());";
        }
        else{
            var query = "INSERT INTO plays (`uid`,`pid`, `sid`, `abid`, `playstime`) VALUES(" + mysql.escape(uid) + ", " + mysql.escape(pid) + ", " + mysql.escape(sid) + ", " + mysql.escape(abid) + ", NOW());";
        }
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.getMostRecentPlayedTrack = function(uid) {
    return new Promise((resolve, reject) => {
        var query = "select s.sid,s.stitle,s.sduration,a.aname, a.aid from songs as s, plays as p,artist as a where p.uid = " + mysql.escape(uid) + " and s.sid = p.sid and a.aid = s.aid order by playstime desc limit 5";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

exports.getSimilarPlayedTrack = function(uid) {
    return new Promise((resolve, reject) => {
        var query = "select s.sid,s.sgenre from songs as s, plays as p,artist as a where p.uid = " + mysql.escape(uid) + " and s.sid = p.sid and a.aid = s.aid order by playstime desc limit 5";
        db.query(query, (err, result) => {
            if (err) {
                reject(err);
            } else {
                console.log(result);
                if(result && result.length > 0){
                    var query1 = "select s.sgenre, s.sid, s.stitle,s.sduration,a.aname, a.aid from songs as s, artist as a where s.aid=a.aid and (";
                    for(var i = 0; i < result.length;i++){
                        query1 += "s.sgenre like '%"+ result[i].sgenre +"%'";
                        if(i<result.length-1){
                            query1 += " or ";
                        }
                    }
                    query1 += ") and (";
                    for(var i = 0; i < result.length;i++){
                        query1 += "s.sid !='"+ result[i].sid +"'";
                        if(i<result.length-1){
                            query1 += " and ";
                        }
                    }
                    query1 += " ) limit 5;";
                    db.query(query1, (err, result1) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(result1);
                        }
                    });
                }else{
                    resolve(result);
                }
            }
        });
    });
}