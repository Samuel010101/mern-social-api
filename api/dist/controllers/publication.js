'use strict';
var path = require('path');
var fs = require('fs');
var moment = require('moment');
var mongoosePaginate = require('mongoose-pagination');
var Publication = require('../models/publication');
var User = require('../models/user');
var Follow = require('../models/follow');
// METODO PARA GUARDAR UNA PUBLICACION
function savePublication(req, res) {
    var params = req.body;
    if (!params.text)
        return res.status(200).send({ message: 'Debes publicar un texto' });
    var publication = new Publication();
    publication.text = params.text;
    publication.file = 'null';
    publication.user = req.user.sub;
    publication.created_at = moment().unix();
    publication.save((err, publicationStored) => {
        if (err)
            return res
                .status(500)
                .send({ message: 'Error al guardar la publicación' });
        if (!publicationStored)
            return res
                .status(404)
                .send({ message: 'La publicación no ha sido guardada' });
        return res.status(200).send({ publication: publicationStored });
    });
}
// METODO PUBLICACIONES TIMELINE (sacar todas las publicaciones)
function getPublications(req, res) {
    var page = 1;
    if (req.params.page) {
        page = req.params.page;
    }
    var itemsPerPage = 5;
    Follow.find({ user: req.user.sub })
        .populate('followed')
        .exec((err, follows) => {
        if (err)
            return res
                .status(500)
                .send({ message: 'Error al devolver seguimiento' });
        var follows_clean = [];
        follows.forEach((follow) => {
            follows_clean.push(follow.followed);
        });
        Publication.find({ user: { $in: follows_clean } })
            .sort('-creacted_at')
            .populate('user')
            .paginate(page, itemsPerPage, (err, publications, total) => {
            if (err)
                return res
                    .status(500)
                    .send({ message: 'Error al devolver publicaciones' });
            if (!publications)
                return res.status(404).send({ message: 'No hay publicaciones' });
            return res.status(200).send({
                total_items: total,
                pages: Math.ceil(total / itemsPerPage),
                page: page,
                publications,
            });
        });
    });
}
// METODO PARA DEVOLVER UNA PUBLICACION EN CONCRETO
function getPublication(req, res) {
    var publicationId = req.params.id;
    Publication.findById(publicationId, (err, publication) => {
        if (err)
            return res
                .status(500)
                .send({ message: 'Error al devolver publicaciones' });
        if (!publication)
            return res.status(404).send({ message: 'No existe la publicación' });
        return res.status(200).send({ publication });
    });
}
// METODO PARA ELIMINAR UNA PUBLICACION
function deletePublication(req, res) {
    var publicationId = req.params.id;
    Publication.find({ user: req.user.sub, _id: publicationId }).remove((err, publicationRemoved) => {
        if (err)
            return res
                .status(500)
                .send({ message: 'Error al borrar la publicación' });
        if (!publicationRemoved)
            return res
                .status(404)
                .send({ message: 'No se ha borrado la publicación' });
        return res
            .status(200)
            .send({ message: 'Publicación borrada correctamente' });
    });
}
function uploadImagePub(req, res) {
    // Capturar el id que viene por la url, del usuario que esta haciendo la petición
    var publicationId = req.params.id;
    if (req.files) {
        var filePath = req.files.image.path;
        var fileSplit = filePath.split('/');
        var fileName = fileSplit[2];
        var extSplit = fileName.split('.');
        var fileExt = extSplit[1];
        if (fileExt == 'png' ||
            fileExt == 'jpg' ||
            fileExt == 'jpeg' ||
            fileExt == 'gif') {
            Publication.findOne({ user: req.user.sub, _id: publicationId }).exec((err, publication) => {
                if (publication) {
                    // Actualizar documentos de la publicación
                    Publication.findByIdAndUpdate(publicationId, { file: fileName }, { new: true }, (err, publicationUpdated) => {
                        if (err)
                            return res
                                .status(500)
                                .send({ message: 'Error en la petición' });
                        if (!publicationUpdated)
                            return res
                                .status(404)
                                .send({ message: 'No se ha podido actualizar el usuario' });
                        return res
                            .status(200)
                            .send({ publication: publicationUpdated });
                        console.log(publicationUpdated);
                    });
                }
                else {
                    return removeFilesOFUploadsPub(res, filePath, 'No tiene permiso para actualizar esta publicación');
                }
            });
        }
        else {
            return removeFilesOFUploadsPub(res, filePath, 'Extensión no valida');
        }
    }
    else {
        return res.status(200).send({ message: 'No se han subido la imagen' });
    }
}
function removeFilesOFUploadsPub(res, filePath, message) {
    fs.unlink(filePath, (err) => {
        return res.status(200).send({ message: message });
    });
}
// METODO PARA DEVOLVER UNA IMAGEN
// PROBAR ESTE METODO LUEGO DE CORREGIR EL METODO UploadImage
function getImageFilePub(req, res) {
    var imageFile = req.params.imageFile;
    var pathFile = './uploads/publications' + imageFile;
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
    savePublication,
    getPublications,
    getPublication,
    deletePublication,
    uploadImagePub,
    getImageFilePub,
};
