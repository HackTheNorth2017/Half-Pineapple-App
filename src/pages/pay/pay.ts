import {Component} from '@angular/core';
import { Http } from '@angular/http';
import {NavController, NavParams, AlertController, LoadingController} from 'ionic-angular';
import {Keyboard} from '@ionic-native/keyboard';
import {TranslateService} from '@ngx-translate/core';

import {NemProvider} from '../../providers/nem/nem.provider';
import {AlertProvider} from '../../providers/alert/alert.provider';
import {ToastProvider} from '../../providers/toast/toast.provider';
import {WalletProvider} from '../../providers/wallet/wallet.provider';

import {LoginPage} from '../login/login';

import {SimpleWallet, Address, XEM, NemAnnounceResult,  MosaicTransferable, MosaicId} from 'nem-library';
import {Observable} from "nem-library/node_modules/rxjs";

import 'rxjs/add/operator/toPromise';

@Component({
    selector: 'page-pay',
    templateUrl: 'pay.html'
})
export class PayPage {
    balance: number;
    recipient: Address;
    fee: number;
    message: string;
    selectedMosaic: MosaicTransferable;
    divisibility: any;
    common: any;
    amount: number;
    selectedWallet: SimpleWallet;
    time : number;
    url: string;
    statusInterval : any;
    statusIntervalCounter: number; 

    constructor(public navCtrl: NavController, private navParams: NavParams, private nem: NemProvider, private wallet: WalletProvider, private alert: AlertProvider, private toast: ToastProvider, private alertCtrl: AlertController, private loading: LoadingController, private keyboard: Keyboard, public translate: TranslateService, private http: Http) {
        this.statusIntervalCounter = 0;
        this.url = "https://ixjdbaxwvy.localtunnel.me";
        this.time = 0;
        this.amount = 0.5;
        // get mosaic and recipient
        this.recipient = null;
        this.fee = 0;
        this.message = '';
        this.balance = 0;
        //Stores sensitive data.
        this.common = {};
        this._clearCommon();
        
        //first call
        this._checkConnection().then(value =>{
            if(!value){
                setInterval(() => {this._checkConnection().then(_ =>{});}, 1000 * 60);
            }
        });
    }

    ionViewWillEnter() {
        this.wallet.getSelectedWallet().then(value => {
            if (!value) {
                this.navCtrl.setRoot(LoginPage);
            }
            else {
                this.selectedWallet = value;
                this.nem.getBalance(this.selectedWallet.address).then(mosaics => {
                    console.log(mosaics);
                    for (var mosaic of mosaics){
                        if(mosaic.mosaicId.namespaceId == "pineapple" && mosaic.mosaicId.name == "token"){
                           this.balance = mosaic.amount;
                        }
                    }
                });
            }
       })
    }

    /**
     * Clears sensitive data
     */
    private _clearCommon() {
        this.common = {
            'password': '',
            'privateKey': ''
        };
    }


     //checks first connection
    private _checkConnection(){
        return this.http.get(this.url +"/health")
              .toPromise().then( res =>{
                  let data = res.json();
                  this.recipient = new Address(data.address);
                  console.log("CONNECTION OK" + " recipient" + this.recipient.plain());
                  return true;
              }).catch(error =>{
                console.log("ERROR CONNECTION");
                this.recipient = null;
                this.time = 0;
                return false;
            });
    };


    private _checkStatus(){

         ++this.statusIntervalCounter;
        
        if(this.statusIntervalCounter == 3){
            this.statusIntervalCounter = 0;
            this.recipient = null;
            this.time = 0;
            return Promise.resolve(false);
        }
        else{
            return this.http.get(this.url +"/status?address="+ this.recipient.plain())
              .toPromise().then( res =>{
                  let data = res.json();
                  this.time = data.timeLeft;
                    console.log("STATUS OK"  + this.time);

                    return true;
              }).catch(error =>{
                    console.log("ERROR STATUS");
                this.time = 0;
                return false;
            });
          }
    };


    /**
     * check if address is from network
     * @param address Address to check
     */
    private _checkAddress(address) {
        if (this.nem.isFromNetwork(address))  return true;
        return false;
    }

    /**
     * Check if user can send transaction
     */
    private _canSendTransaction() {
        if (this.common.password && this._checkAddress) {
            try {
                this.common.privateKey = this.nem.passwordToPrivateKey(this.common.password, this.selectedWallet);
                return true;
            } catch (err) {
                return false;
            }
        }
        return false;
    }

    /**
     * Confirms transaction form xem and mosaicsTransactions
     */
    private _confirmTransaction(): Observable<NemAnnounceResult> {
        let transferTransaction = this.nem.prepareMosaicTransaction(this.recipient, [this.selectedMosaic], this.message);
        return this.nem.confirmTransaction(transferTransaction, this.selectedWallet, this.common.password);
    }

    /**
     * alert Confirmation subtitle builder
     */
    private _subtitleBuilder(res){

        var subtitle = res['YOU_ARE_GOING_TO_SEND'] + ' <br/><br/> ';
        var currency = "<b>"+res['AMOUNT']+"</b> " + this.amount + " " + this.selectedMosaic.mosaicId.description();
  
        subtitle += currency;

        var _fee = this.fee / 1000000;

        subtitle += '<br/><br/>  <b>'+res['FEE']+':</b> ' + _fee + ' xem';
        return Promise.resolve(subtitle);
    }

    /**
     * Presents prompt to confirm the transaction, handling confirmation
     */
    private _presentPrompt() {
        this.translate.get(['YOU_ARE_GOING_TO_SEND','AMOUNT','FEE', 'LEVY', 'CONFIRM_TRANSACTION', 'PASSWORD','CANCEL','CONFIRM','PLEASE_WAIT'], {}).subscribe((res) => {
            this._subtitleBuilder(res).then(subtitle => {

                let alert = this.alertCtrl.create({
                    title: res['CONFIRM_TRANSACTION'],
                    subTitle: subtitle,
                    inputs: [
                        {
                            name: 'password',
                            placeholder: res['PASSWORD'],
                            type: 'password'
                        },
                    ],
                    buttons: [
                        {
                            text: res['CANCEL'],
                            role: 'cancel'
                        },
                        {
                            text: res['CONFIRM'],
                            handler: data => {
                                this.keyboard.close();
                                this.common.password = data.password;

                                let loader = this.loading.create({
                                    content: res['PLEASE_WAIT']
                                });

                                loader.present().then(
                                    _ => {
                                        if (this._canSendTransaction()) {
                                            this._confirmTransaction().subscribe(value => {
                                                loader.dismiss();
                                                this.toast.showTransactionConfirmed();
                                                
                                                this._checkStatus().then(value =>{
                                                    if(!value){
                                                        this.statusInterval = setInterval(() => {this._checkStatus().then(_ =>{});}, 1000 * 60);
                                                    }
                                                });

                                                this._clearCommon();
                                            }, error => {
                                                loader.dismiss();

                                                if (error.toString() == 'FAILURE_INSUFFICIENT_BALANCE') {
                                                    this.alert.showDoesNotHaveEnoughFunds();
                                                }
                                                else {
                                                    this.alert.showError(error);
                                                }
                                            });
                                        }
                                        else {
                                            this._clearCommon();
                                            loader.dismiss();
                                            this.alert.showInvalidPasswordAlert();
                                        }
                                    });
                            }
                        }
                    ]
                });

                alert.onDidDismiss(() => {
                    this.keyboard.close()
                });

                alert.present();
            });
        });
    }

    /**
     * Sets transaction amount and determine if it is mosaic or xem transaction, updating fees
     */
    public startTransaction() {

        this.nem.getMosaicTransferableDefinition(new MosaicId('pineapple', 'token'), this.amount).subscribe(selectedMosaic =>{
            this.selectedMosaic = selectedMosaic;
            console.log(selectedMosaic);
            var transferTransaction =  this.nem.prepareMosaicTransaction(this.recipient,[this.selectedMosaic], this.message);
            this.fee = transferTransaction.fee;
            this._presentPrompt();
        });
    }

    public selectFullPineapple(){
        this.amount = 1;
    }

    public selectHalfPinneapple(){
        this.amount = 0.5;
    }
}
