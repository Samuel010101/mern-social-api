'use strict';
var bcrypt = require('bcrypt-nodejs');
var mongoosePagination = require('mongoose-pagination');
var fs = require('fs');
var path = require('path');
var User = require('../models/user');
var Follow = require('../models/follow');
var Publication = require('../models/publication');
var jwt = require('../services/jwt');
function home(req, res) {
    res.status(200).send({
        message: 'Mean red social',
    });
}
// METODO PARA REGISTRAR USUARIO
function saveUser(req, res) {
    // Recoger los parametros del body
    var params = req.body;
    //  Crear una instancia del modelo de datos
    var user = User();
    // Verificar que los campos obligatorios vengan con datos en el body de la peticion
    if (params.name &&
        params.surname &&
        params.nick &&
        params.email &&
        params.password) {
        user.name = params.name;
        user.surname = params.surname;
        user.nick = params.nick;
        user.email = params.email;
        user.role = 'ROLE_USER';
        user.image = null;
        // Controlar usuarios duplicados
        // Mejorar este bloque del codigo, no esta asumiendo el campo nick para el control de duplicidad
        User.find({
            $or: [
                { email: user.email.toLowerCase() },
                { nick: user.nick.toLowerCase() },
            ],
        }).exec((err, users) => {
            if (err)
                return res
                    .status(500)
                    .send({ message: 'Error en la petición de usuarios' });
            if (users && users.length >= 1) {
                return res
                    .status(200)
                    .send({ message: 'El usuario que intenta registrar ya existe' });
            }
            else {
                // Generar la contraseña cifrada y guardar los datos
                bcrypt.hash(params.password, null, null, (err, hash) => {
                    user.password = hash;
                    user.save((err, userStored) => {
                        if (err)
                            return res
                                .status(500)
                                .send({ message: 'Error al guardar el usuario' });
                        if (userStored) {
                            res.status(200).send({ user: userStored });
                        }
                        else {
                            res
                                .status(400)
                                .send({ message: 'No se ha registrado el usuario' });
                        }
                    });
                });
            }
        });
    }
    else {
        res.status(200).send({ message: 'Llenar todos los campos obligatorios' });
    }
}
// METODO PARA LOGUEAR UN USUARIO
function loginUser(req, res) {
    // Capturar los datos que me llegan en la petición del body
    var params = req.body;
    // Almacenar esos datos en variables
    var email = params.email;
    var password = params.password;
    // Verificar si los datos o usuario existe
    User.findOne({ email: email }, (err, user) => {
        if (err)
            return res.status(500).send({ message: 'Error en la petición' });
        if (user) {
            // El metodo compare de bcrypt encripta la password que recibimos para comprarla con la de la base de datos
            bcrypt.compare(password, user.password, (err, check) => {
                if (check) {
                    if (params.gettoken) {
                        // Generar y devolver un token
                        return res.status(200).send({
                            token: jwt.createToken(user),
                        });
                    }
                    else {
                        // Devolver datos del usuario
                        user.password = undefined;
                        return res.status(200).send({ user });
                    }
                }
                else {
                    return res
                        .status(404)
                        .send({ message: 'El usuario no se ha podido identificar' });
                }
            });
        }
    });
}
// METODO PARA EXTRAER LOS DATOS DE UN USUARIO
// ESTE METODO DEBE SER REVISADO PORQUE AL DEVOLVER EL OBJETO DE LA PETICION ESTA DEVOLVIENDO EL
// OBJETO VALUE VACIO, DONDE DEBE DEVOLVER SI SIGUE Y ES SEGUIDO POR DICHO USUARIO
function getUser(req, res) {
    var userId = req.params.id;
    User.findById(userId, (err, user) => {
        if (err)
            return res.status(500).send({ message: 'Error en la petición' });
        if (!user)
            return res.status(404).send({ message: 'El usuario no existe' });
        // Estas lineas siguientes de codigo me permite saber si estoy siguiendo a este usuario o no
        return followThisUser(req.user.sub, userId).then((value) => {
            user.password = undefined;
            return res.status(200).send({ user, value });
        });
    });
}
async function followThisUser(identity_user_id, user_id) {
    try {
        var following = await Follow.findOne({
            user: identity_user_id,
            followed: user_id,
        })
            .exec()
            .then((following) => {
            console.log(following);
            return following;
        })
            .catch((err) => {
            return handleerror(err);
        });
        var followed = await Follow.findOne({
            user: user_id,
            followed: identity_user_id,
        })
            .exec()
            .then((followed) => {
            console.log(followed);
            return followed;
        })
            .catch((err) => {
            return handleerror(err);
        });
        return {
            following: following,
            followed: followed,
        };
    }
    catch (e) {
        console.log(e);
    }
}
// METODO PARA DEVOLVER UN LISTADO DE USUARIOS PAGINADOS
function getUsers(req, res) {
    // Obtener el id del usuario logueado
    var identity_user_id = req.user.sub;
    var page = 1;
    if (req.params.page) {
        page = req.params.page;
    }
    var itemsPerPage = 5;
    User.find()
        .sort('_id')
        .paginate(page, itemsPerPage, (err, users, total) => {
        if (err)
            return res.status(500).send({ message: 'Error en la petición' });
        if (!users)
            return res.status(404).send({ message: 'No hay usuarios disponibles' });
        followUserIds(identity_user_id).then((value) => {
            return res.status(200).send({
                users,
                user_following: value.following,
                user_followed_me: value.followed,
                total,
                pages: Math.ceil(total / itemsPerPage),
            });
        });
    });
}
async function followUserIds(user_id) {
    var following = await Follow.find({ user: user_id })
        .select({ _id: 0, __v: 0, user: 0 })
        .exec()
        .then((following) => {
        return following;
    })
        .catch((err) => {
        return handleerror(err);
    });
    var followed = await Follow.find({ followed: user_id })
        .select({ _id: 0, __v: 0, followed: 0 })
        .exec()
        .then((followed) => {
        return followed;
    })
        .catch((err) => {
        return handleerror(err);
    });
    // Procesar following ids
    var following_clean = [];
    following.forEach((follow) => {
        following_clean.push(follow.followed);
    });
    // Procesar followed ids
    var followed_clean = [];
    followed.forEach((follow) => {
        followed_clean.push(follow.user);
    });
    return {
        following: following_clean,
        followed: followed_clean,
    };
}
// METODO PARA CONTABILIZAR LOS USUARIOS QUE SIGO, LOS QUE ME SIGUEN Y LAS PUBLICACIONES
function getCounters(req, res) {
    var userId = req.user.sub;
    if (req.params.id) {
        userId = req.params.id;
    }
    getCountFollow(userId).then((value) => {
        return res.status(200).send({ value });
        console.log(value);
    });
}
const getCountFollow = async (user_id) => {
    try {
        // Lo hice de dos formas. "following" con callback de countDocuments y "followed" con una promesa
        var following = await Follow.countDocuments({ user: user_id }).then((count) => count);
        var followed = await Follow.countDocuments({ followed: user_id }).then((count) => count);
        var publication = await Publication.countDocuments({ user: user_id }).then((count) => count);
        return { following, followed, publication };
    }
    catch (e) {
        console.log(e);
    }
};
// METODO PARA ACTUALIZAR LOS DATOS DE UN USUARIO
function updateUser(req, res) {
    // Capturar el id que viene por la url, del usuario que esta haciendo la petición
    var userId = req.params.id;
    // Capturar los datos que viene en el cuerpo de la petición, que son los que van para actualizar
    var update = req.body;
    //  Borrar el password que viene en la petición del usuario
    delete update.password;
    // Validar que el id del usuario que viene en la petición sea el mismo del usuario que hace la petición
    // solo el propio usuario puede actualizar sus datos
    if (userId != req.user.sub) {
        return res
            .status(500)
            .send({ message: 'No tienes permiso para actualizar este usuario' });
    }
    User.findByIdAndUpdate(userId, update, { new: true }, (err, userUpdated) => {
        if (err)
            return res.status(500).send({ message: 'Error en la petición' });
        if (!userUpdated)
            return res
                .status(404)
                .send({ message: 'No se ha podido actualizar el usuario' });
        return res.status(200).send({ user: userUpdated });
    });
}
// METODO PARA SUBIR ARCHIVOS DE IMAGEN/AVATAR DE UN USUARIO
function uploadImage(req, res) {
    // Capturar el id que viene por la url, del usuario que esta haciendo la petición
    var userId = req.params.id;
    if (req.files) {
        var filePath = req.files.image.path;
        var fileSplit = filePath.split('/');
        var fileName = fileSplit[2];
        var extSplit = fileName.split('.');
        var fileExt = extSplit[1];
        // Validar que el id del usuario que viene en la petición sea el mismo del usuario que hace la petición
        if (userId != req.user.sub) {
            return removeFilesOFUploads(res, filePath, 'No tiene permiso para actualizar los datos del usuario');
        }
        if (fileExt == 'png' ||
            fileExt == 'jpg' ||
            fileExt == 'jpeg' ||
            fileExt == 'gif') {
            // Actualizar documentos de usuarios logueado
            User.findByIdAndUpdate(userId, { image: fileName }, { new: true }, (err, userUpdated) => {
                if (err)
                    return res.status(500).send({ message: 'Error en la petición' });
                if (!userUpdated)
                    return res
                        .status(404)
                        .send({ message: 'No se ha podido actualizar el usuario' });
                return res.status(200).send({ user: userUpdated });
                console.log(userUpdated);
            });
        }
        else {
            return removeFilesOFUploads(res, filePath, 'Extensión no valida');
        }
    }
    else {
        return res.status(200).send({ message: 'No se ha subido la imagen' });
    }
}
function removeFilesOFUploads(res, filePath, message) {
    fs.unlink(filePath, (err) => {
        return res.status(200).send({ message: message });
    });
}
// METODO PARA DEVOLVER UNA IMAGEN
// PROBAR ESTE METODO LUEGO DE CORREGIR EL METODO UploadImage
function getImageFile(req, res) {
    var imageFile = req.params.imageFile;
    var pathFile = './uploads/users' + imageFile;
    fs.exists(pathFile, (exists) => {
        if (exists) {
            res.sendFile(path.resolve(pathFile));
        }
        else {
            res.status(200).send({ message: 'No existe la imagen...' });
        }
    });
}
module.exports = {
    home,
    saveUser,
    loginUser,
    getUser,
    getUsers,
    getCounters,
    updateUser,
    uploadImage,
    getImageFile,
};
function handleerror(err) {
    throw new Error('Function not implemented.');
}
