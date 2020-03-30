const mongoose = require('mongoose');

const IpAddressSchema = new mongoose.Schema({
    ip: {
        type: String,
        required: true,
        minlength: 1,
        trim: true,
        unique: true
    },
    timeStamp: {
        type: Number,
        required: true,
        minlength: 1
    },
    count: {
        type: Number,
        required: true,
        minlength: 1
    }
});

IpAddressSchema.statics.needsVerification = function (ipReceived) {
    const IpAddress = this;

    return IpAddress.findOne({
        ip: ipReceived
    }).then((ip) => {
        if (!ip) return saveNewIpToDatabase(ipReceived);

        const timeStamp = ip.timeStamp;
        const count = ++ip.count;
        console.log('ip.count', ip.count);

        // If we find the IP in the database now we update the count as well
        IpAddress.findOneAndUpdate({
            ip: ipReceived
        }, {
            $set: {
                count
            }
        }).then(IpAddressDoc => null);

        return checkExistingIp({
            timeStamp,
            ip: ipReceived,
            count
        });


    });


}

let saveNewIpToDatabase = (ip) => {
    return new Promise((resolve, reject) => {
        console.log('IP not found, ip is: ', ip);

        const ipAddress = new IpAddress({
            ip,
            timeStamp: Date.now(),
            count: 1
        });

        ipAddress.save().then(ipDoc => {
            return resolve(false);
        }).catch(e => {
            reject(e);
        });
    });
};


let checkExistingIp = ({
    timeStamp,
    ip,
    count
}) => {

    const millisecondsInADay = 24 * 60 * 60 * 1000;
    const days = 2;
    const addedTimeToCheck = days * millisecondsInADay;

    let timeOfViolationCrossed = timeStamp + addedTimeToCheck < Date.now() ? true : false;

    if (!timeOfViolationCrossed && count > 3) {
        // needs google recaptcha verification
        console.log('perform google recaptcha');
        return true;
    } else {

        if (timeOfViolationCrossed) {
            IpAddress.findOneAndUpdate({
                ip: ipReceived
            }, {
                $set: {
                    count: 1
                }
            }).then(IpAddressObj => {
                // we've found the IP in the database now we reset the count as well
                return false;
            });
        } else {
            return false;
        }

    }


};

const IpAddress = mongoose.model('IpAddress', IpAddressSchema);

module.exports = {
    IpAddress
}