'use strict';

var bcrypt = require('bcrypt-nodejs');
var mongoosePagination = require('mongoose-pagination');
var fs = require('fs');
var path = require('path');

var User = require('../models/user');
var Follow = require('../models/follow');
var jwt = require('../services/jwt');

function home(req: any, res: any) {
  res.status(200).send({
    message: 'Mean red social',
  });
}

// METODO PARA REGISTRAR USUARIO
function saveUser(req: any, res: any) {
  // Recoger los parametros del body
  var params = req.body;
  //  Crear una instancia del modelo de datos
  var user = User();

  // Verificar que los campos obligatorios vengan con datos en el body de la peticion
  if (
    params.name &&
    params.surname &&
    params.nick &&
    params.email &&
    params.password
  ) {
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
    }).exec((err: any, users: any) => {
      if (err)
        return res
          .status(500)
          .send({ message: 'Error en la petición de usuarios' });

      if (users && users.length >= 1) {
        return res
          .status(200)
          .send({ message: 'El usuario que intenta registrar ya existe' });
      } else {
        // Generar la contraseña cifrada y guardar los datos
        bcrypt.hash(params.password, null, null, (err: any, hash: any) => {
          user.password = hash;

          user.save((err: any, userStored: any) => {
            if (err)
              return res
                .status(500)
                .send({ message: 'Error al guardar el usuario' });

            if (userStored) {
              res.status(200).send({ user: userStored });
            } else {
              res
                .status(400)
                .send({ message: 'No se ha registrado el usuario' });
            }
          });
        });
      }
    });
  } else {
    res.status(200).send({ message: 'Llenar todos los campos obligatorios' });
  }
}

// METODO PARA LOGUEAR UN USUARIO
function loginUser(req: any, res: any) {
  // Capturar los datos que me llegan en la petición del body
  var params = req.body;

  // Almacenar esos datos en variables
  var email = params.email;
  var password = params.password;

  // Verificar si los datos o usuario existe
  User.findOne({ email: email }, (err: any, user: any) => {
    if (err) return res.status(500).send({ message: 'Error en la petición' });

    if (user) {
      // El metodo compare de bcrypt encripta la password que recibimos para comprarla con la de la base de datos
      bcrypt.compare(password, user.password, (err: any, check: any) => {
        if (check) {
          if (params.gettoken) {
            // Generar y devolver un token
            return res.status(200).send({
              token: jwt.createToken(user),
            });
          } else {
            // Devolver datos del usuario
            user.password = undefined;
            return res.status(200).send({ user });
          }
        } else {
          return res
            .status(404)
            .send({ message: 'El usuario no se ha podido identificar' });
        }
      });
    }
  });
}

// METODO PARA EXTRAER LOS DATOS DE UN USUARIO
function getUser(req: any, res: any) {
  var userId = req.params.id;

  User.findById(userId, (err: any, user: any) => {
    if (err) return res.status(500).send({ message: 'Error en la petición' });

    if (!user) return res.status(404).send({ message: 'El usuario no existe' });
    // Estas lineas siguientes de codigo me permite saber si estoy siguiendo a este usuario o no

    followingthisUser(req.user.sub, userId).then((value) => {
      user.password = undefined;
      return res.status(200).send({ user, value });
    });
  });
}

async function followingthisUser(identity_user_id: any, user_id: any) {
  var following = await Follow.findOne({
    user: identity_user_id,
    followed: user_id,
  }).exec((err: string, follow: any) => {
    if (err) return err;
    return follow;
  });

  var followed = await Follow.findOne({
    user: user_id,
    followed: identity_user_id,
  }).exec((err: string, follow: any) => {
    if (err) return err;
    return follow;
  });

  return {
    following: following,
    followed: followed,
  };
}

// METODO PARA DEVOLVER UN LISTADO DE USUARIOS PAGINADOS
function getUsers(req: any, res: any) {
  // Obtener el id del usuario logueado
  var identity_user_id = req.user.sub;
  var page = 1;

  if (req.params.page) {
    page = req.params.page;
  }

  var itemsPerPage = 5;

  User.find()
    .sort('_id')
    .paginate(page, itemsPerPage, (err: any, users: any, total: number) => {
      if (err) return res.status(500).send({ message: 'Error en la petición' });

      if (!users)
        return res.status(404).send({ message: 'No hay usuarios disponibles' });

      return res.status(200).send({
        users,
        total,
        pages: Math.ceil(total / itemsPerPage),
      });
    });
}

// METODO PARA ACTUALIZAR LOS DATOS DE UN USUARIO
function updateUser(req: any, res: any) {
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

  User.findByIdAndUpdate(
    userId,
    update,
    { new: true },
    (err: any, userUpdated: any) => {
      if (err) return res.status(500).send({ message: 'Error en la petición' });

      if (!userUpdated)
        return res
          .status(404)
          .send({ message: 'No se ha podido actualizar el usuario' });

      return res.status(200).send({ user: userUpdated });
    }
  );
}

// METODO PARA SUBIR ARCHIVOS DE IMAGEN/AVATAR DE UN USUARIO
// ESTE METODO ESTA PENDIENTE A REVISAR PORQUE NO ESTA FUNCIONANDO CORRECTAMENTE TODAVIA
function uploadImage(req: any, res: any) {
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
      return removeFilesOFUploads(
        res,
        filePath,
        'No tiene permiso para actualizar los datos del usuario'
      );
    }

    if (
      fileExt == 'png' ||
      fileExt == 'jpg' ||
      fileExt == 'jpeg' ||
      fileExt == 'gif'
    ) {
      // Actualizar documentos de usuarios logueado
      User.findByIdAndUpdate(
        userId,
        { image: fileName },
        { new: true },
        (err: any, userUpdated: any) => {
          if (err)
            return res.status(500).send({ message: 'Error en la petición' });

          if (!userUpdated)
            return res
              .status(404)
              .send({ message: 'No se ha podido actualizar el usuario' });

          return res.status(200).send({ user: userUpdated });
          console.log(userUpdated);
        }
      );
    } else {
      return removeFilesOFUploads(res, filePath, 'Extensión no valida');
    }
  } else {
    return res.status(200).send({ message: 'No se han subido la imagen' });
  }
}

function removeFilesOFUploads(res: any, filePath: any, message: string) {
  fs.unlink(filePath, (err: any) => {
    return res.status(200).send({ message: message });
  });
}

// METODO PARA DEVOLVER UNA IMAGEN
// PROBAR ESTE METODO LUEGO DE CORREGIR EL METODO UploadImage
function getImageFile(req: any, res: any) {
  var imageFile = req.params.imageFile;
  var pathFile = './uploads' + imageFile;

  fs.exists(pathFile, (exists: any) => {
    if (exists) {
      res.sendFile(path.resolve(pathFile));
    } else {
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
  updateUser,
  uploadImage,
  getImageFile,
};
// function handleError(err: string) {
//   throw new Error('Error en el servidor');
// }
